const fs = require('fs');
const path = require('path');

const LLM_BASE_URL = process.env.LLM_BASE_URL || 'https://api.groq.com/openai/v1';
const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';

function heuristicExtract(text) {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const skillHints = [
    'javascript',
    'typescript',
    'react',
    'node',
    'nodejs',
    'python',
    'java',
    'mongodb',
    'express',
    'aws',
    'docker',
    'kubernetes',
    'sql',
    'postgres',
    'redis',
    'graphql',
    'next.js',
    'vue',
    'angular',
    'go',
    'rust',
    'c#',
    '.net',
    'swift',
    'kotlin',
    'html',
    'css',
    'tailwind',
    'figma',
    'git',
    'ci/cd',
    'linux',
    'azure',
    'gcp',
  ];
  const lower = text.toLowerCase();
  const skills = skillHints.filter((s) => lower.includes(s));
  const emailMatch = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  const headline = lines[0] || 'Professional';
  const titles = [];
  for (const line of lines.slice(0, 30)) {
    if (/(engineer|developer|designer|manager|analyst|architect)/i.test(line) && line.length < 80) {
      titles.push(line.replace(/[|•·].*$/, '').trim());
    }
  }
  return {
    headline: headline.slice(0, 120),
    summary: lines.slice(0, 8).join(' ').slice(0, 600),
    skills: [...new Set(skills.map((s) => s.replace('nodejs', 'node.js')))],
    experience: titles.slice(0, 3).map((title) => ({
      title,
      company: '',
      summary: '',
    })),
    locations: [],
    remotePreference: lower.includes('remote') ? 'remote' : 'any',
    seniority: /senior|lead|staff|principal/i.test(text)
      ? 'senior'
      : /junior|intern|entry/i.test(text)
        ? 'junior'
        : 'mid',
    targetTitles: titles.slice(0, 3),
    visaPrefs: '',
    _meta: { method: 'heuristic', email: emailMatch?.[0] || null },
  };
}

async function llmExtract(text) {
  if (!GROQ_API_KEY) {
    return heuristicExtract(text);
  }

  const system = `You extract structured career profiles from resume text.
Return ONLY valid JSON with keys:
headline, summary, skills (string[]), experience (array of {title, company, years?, summary}),
locations (string[]), remotePreference (remote|hybrid|onsite|any), seniority (string),
targetTitles (string[]), visaPrefs (string).
No markdown.`;

  const res = await fetch(`${LLM_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${GROQ_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      temperature: 0.2,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: text.slice(0, 12000) },
      ],
      response_format: { type: 'json_object' },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error('[profiler] LLM error', res.status, errText);
    return heuristicExtract(text);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content || '{}';
  try {
    const parsed = JSON.parse(content);
    return {
      headline: parsed.headline || '',
      summary: parsed.summary || '',
      skills: Array.isArray(parsed.skills) ? parsed.skills.map(String) : [],
      experience: Array.isArray(parsed.experience) ? parsed.experience : [],
      locations: Array.isArray(parsed.locations) ? parsed.locations.map(String) : [],
      remotePreference: ['remote', 'hybrid', 'onsite', 'any'].includes(parsed.remotePreference)
        ? parsed.remotePreference
        : 'any',
      seniority: parsed.seniority || '',
      targetTitles: Array.isArray(parsed.targetTitles) ? parsed.targetTitles.map(String) : [],
      visaPrefs: parsed.visaPrefs || '',
      _meta: { method: 'llm' },
    };
  } catch {
    return heuristicExtract(text);
  }
}

async function extractTextFromUpload(file) {
  if (!file) return '';
  const ext = path.extname(file.originalname || '').toLowerCase();
  if (ext === '.pdf' || file.mimetype === 'application/pdf') {
    const pdfParse = require('pdf-parse');
    const buffer = fs.readFileSync(file.path);
    const data = await pdfParse(buffer);
    return data.text || '';
  }
  return fs.readFileSync(file.path, 'utf8');
}

module.exports = { llmExtract, heuristicExtract, extractTextFromUpload };
