const fs = require('fs');
const path = require('path');

const LLM_BASE_URL = process.env.LLM_BASE_URL || 'https://api.groq.com/openai/v1';
const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';

function loadPrompt(name) {
  const file = path.join(__dirname, `../prompts/v1/${name}.txt`);
  return fs.readFileSync(file, 'utf8');
}

function extractJson(text) {
  const trimmed = String(text || '').trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fence ? fence[1] : trimmed;
  return JSON.parse(raw);
}

async function chatJson(system, user, { temperature = 0.2 } = {}) {
  if (!GROQ_API_KEY) {
    return { _fallback: true };
  }

  const res = await fetch(`${LLM_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${GROQ_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      temperature,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      response_format: { type: 'json_object' },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`LLM error ${res.status}: ${errText}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content || '{}';
  try {
    return extractJson(content);
  } catch {
    // retry once with stricter instruction
    const retry = await fetch(`${LLM_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        temperature: 0,
        messages: [
          { role: 'system', content: system + '\nReturn valid JSON only.' },
          { role: 'user', content: user },
        ],
        response_format: { type: 'json_object' },
      }),
    });
    const retryData = await retry.json();
    return extractJson(retryData.choices?.[0]?.message?.content || '{}');
  }
}

function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .split(/[^a-z0-9+#.]/)
    .filter((t) => t.length > 1);
}

function skillOverlapScore(profile, job) {
  const skills = (profile.skills || []).map((s) => s.toLowerCase());
  const titles = (profile.targetTitles || []).map((s) => s.toLowerCase());
  const hay = `${job.title} ${job.description} ${(job.tags || []).join(' ')}`.toLowerCase();
  let score = 20;
  for (const skill of skills) {
    if (skill && hay.includes(skill)) score += 8;
  }
  for (const title of titles) {
    const tokens = tokenize(title);
    if (tokens.some((t) => hay.includes(t))) score += 10;
  }
  if (profile.remotePreference === 'remote' && job.remote) score += 10;
  if (profile.seniority && hay.includes(String(profile.seniority).toLowerCase())) score += 5;
  return Math.min(95, score);
}

module.exports = {
  loadPrompt,
  chatJson,
  skillOverlapScore,
  tokenize,
  hasLlm: () => Boolean(GROQ_API_KEY),
};
