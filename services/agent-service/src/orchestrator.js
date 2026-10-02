const { loadPrompt, chatJson, skillOverlapScore, hasLlm } = require('./llm');
const { AgentRun, AgentMessage, ApplyPack } = require('./models');

const PROFILE_SERVICE_URL = process.env.PROFILE_SERVICE_URL || 'http://localhost:4002';
const JOB_SERVICE_URL = process.env.JOB_SERVICE_URL || 'http://localhost:4003';

async function fetchProfile(userId) {
  const res = await fetch(`${PROFILE_SERVICE_URL}/profiles/internal/${userId}`);
  if (!res.ok) return { userId, skills: [], targetTitles: [] };
  const data = await res.json();
  return data.profile || { userId, skills: [], targetTitles: [] };
}

async function searchJobs(filters) {
  const params = new URLSearchParams({
    q: filters.query || 'software engineer',
    location: filters.location || '',
    remote: String(filters.remote !== false),
    limit: String(filters.limit || 30),
  });
  const res = await fetch(`${JOB_SERVICE_URL}/jobs/search?${params}`);
  if (!res.ok) throw new Error(`job-service error ${res.status}`);
  return res.json();
}

function extractSearchQuery(message, profile) {
  const quoted = message.match(/["']([^"']+)["']/);
  if (quoted) return quoted[1].trim();

  const stop = new Set([
    'a',
    'an',
    'the',
    'find',
    'me',
    'my',
    'for',
    'of',
    'in',
    'on',
    'to',
    'and',
    'or',
    'with',
    'please',
    'want',
    'looking',
    'search',
    'show',
    'get',
    'any',
    'some',
    'this',
    'week',
    'jobs',
    'job',
    'roles',
    'role',
    'openings',
    'position',
    'positions',
    'apply',
    'can',
    'i',
    'am',
    'is',
    'are',
    'remote',
    'hybrid',
    'work',
    'from',
    'home',
  ]);

  const tokens = String(message || '')
    .toLowerCase()
    .replace(/[^a-z0-9+#.\s-]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1 && !stop.has(t));

  if (tokens.length) return tokens.join(' ');

  if (profile.targetTitles?.length) return profile.targetTitles.slice(0, 2).join(' ');
  if (profile.skills?.length) return profile.skills.slice(0, 3).join(' ');
  return 'software engineer';
}

function heuristicPlan(message, profile) {
  const lower = message.toLowerCase();
  if (/cover letter|apply pack|tailor/.test(lower)) {
    return {
      intent: 'apply_pack',
      query: '',
      location: '',
      remote: true,
      limit: 10,
      reply: 'Open a saved job and generate an apply pack from there.',
    };
  }
  if (/hello|hi|help|what can you/.test(lower) && !/job|role|hiring|apply/.test(lower)) {
    return {
      intent: 'general',
      query: '',
      location: '',
      remote: true,
      limit: 10,
      reply:
        'I am Career Copilot. Tell me what roles you want and I will search live job APIs, score fit, and prepare apply packs.',
    };
  }

  const query = extractSearchQuery(message, profile);
  const wantsRemote = /remote|work from home|wfh/.test(lower);

  return {
    intent: 'search_jobs',
    query: query || 'software engineer',
    location: wantsRemote ? '' : profile.locations?.[0] || '',
    remote: wantsRemote || profile.remotePreference !== 'onsite',
    limit: 30,
  };
}

async function plan(message, profile) {
  const system = loadPrompt('planner');
  const user = JSON.stringify({ message, profile }, null, 2);
  try {
    const result = await chatJson(system, user);
    if (result._fallback) return heuristicPlan(message, profile);
    return {
      intent: result.intent || 'search_jobs',
      query: result.query || heuristicPlan(message, profile).query,
      location: result.location || '',
      remote: result.remote !== false,
      limit: result.limit || 30,
      reply: result.reply,
    };
  } catch (err) {
    console.warn('[orchestrator] plan fallback', err.message);
    return heuristicPlan(message, profile);
  }
}

function queryRelevance(job, query) {
  const q = String(query || '')
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 1);
  if (!q.length) return 0;
  const hay = `${job.title} ${job.company} ${job.description} ${(job.tags || []).join(' ')}`.toLowerCase();
  let hit = 0;
  for (const term of q) {
    if (hay.includes(term)) hit += term.length <= 3 ? 8 : 18;
    if ((job.title || '').toLowerCase().includes(term)) hit += 20;
  }
  return hit;
}

function cheapFilter(jobs, profile, query) {
  return [...jobs]
    .map((job) => {
      const profileScore = skillOverlapScore(profile, job);
      const qScore = queryRelevance(job, query);
      // Prefer jobs that match the user's asked role (e.g. SEO), not only profile skills
      const score = Math.min(98, Math.round(qScore * 0.65 + profileScore * 0.35));
      return { job, score, qScore };
    })
    .filter((x) => x.qScore > 0 || x.score >= 35)
    .sort((a, b) => b.score - a.score || b.qScore - a.qScore)
    .slice(0, 20);
}

async function matchJobs(profile, ranked, query) {
  const top = ranked.slice(0, 15);
  if (!top.length) return [];

  const system = loadPrompt('matcher');
  const payload = {
    searchQuery: query,
    profile: {
      headline: profile.headline,
      skills: profile.skills,
      seniority: profile.seniority,
      targetTitles: profile.targetTitles,
      remotePreference: profile.remotePreference,
      summary: (profile.summary || '').slice(0, 800),
    },
    jobs: top.map(({ job, score }) => ({
      jobId: job.id,
      title: job.title,
      company: job.company,
      location: job.location,
      remote: job.remote,
      tags: job.tags,
      description: (job.description || '').slice(0, 600),
      overlapHint: score,
    })),
  };

  try {
    const result = await chatJson(system, JSON.stringify(payload));
    if (result._fallback || !Array.isArray(result.matches)) {
      return top.slice(0, 8).map(({ job, score }) => ({
        ...job,
        fitScore: score,
        reasons: [
          'Matched based on skill overlap with your profile',
          job.remote ? 'Remote-friendly listing' : `Location: ${job.location || 'n/a'}`,
          `Source: ${job.source}`,
        ],
      }));
    }

    const byId = new Map(top.map(({ job }) => [job.id, job]));
    return result.matches
      .map((m) => {
        const job = byId.get(m.jobId);
        if (!job) return null;
        return {
          ...job,
          fitScore: Math.max(0, Math.min(100, Number(m.fitScore) || 0)),
          reasons: Array.isArray(m.reasons) ? m.reasons.slice(0, 3) : [],
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.fitScore - a.fitScore)
      .slice(0, 8);
  } catch (err) {
    console.warn('[orchestrator] match fallback', err.message);
    return top.slice(0, 8).map(({ job, score }) => ({
      ...job,
      fitScore: score,
      reasons: ['Matched via skill overlap (LLM unavailable)', `Source: ${job.source}`],
    }));
  }
}

function buildReply(filters, matched) {
  if (!matched.length) {
    return `I searched for "${filters.query}" but did not find strong matches. Try different keywords or update your profile skills.`;
  }
  const lines = matched
    .slice(0, 5)
    .map((j, i) => `${i + 1}. ${j.title} at ${j.company} (fit ${j.fitScore})`)
    .join('\n');
  return `Here are the best matches for "${filters.query}" from live job APIs:\n\n${lines}\n\nUse Apply on the matched jobs panel to open the source listing.`;
}

async function updateRun(runId, patch) {
  return AgentRun.findByIdAndUpdate(runId, { $set: patch }, { new: true });
}

async function runAgentPipeline(runId) {
  const run = await AgentRun.findById(runId);
  if (!run) return;

  try {
    await updateRun(runId, { status: 'planning' });
    const profile = await fetchProfile(run.userId);
    const filters = await plan(run.message, profile);

    if (filters.intent === 'clarify' || filters.intent === 'general') {
      const reply = filters.reply || 'Tell me what kind of role you are looking for.';
      await updateRun(runId, {
        status: 'completed',
        filters,
        reply,
        jobs: [],
      });
      await AgentMessage.create({
        conversationId: run.conversationId,
        userId: run.userId,
        role: 'assistant',
        content: reply,
        runId: run._id.toString(),
        jobs: [],
      });
      return;
    }

    await updateRun(runId, { status: 'scouting', filters });
    const search = await searchJobs(filters);
    const sourcesQueried = search.sourcesQueried || [];

    await updateRun(runId, { status: 'matching', sourcesQueried });
    const ranked = cheapFilter(search.jobs || [], profile, filters.query);
    // Prefer listings that actually mention the asked role; drop pure mismatches
    const relevant = ranked.filter((x) => x.qScore > 0);
    const matched = await matchJobs(profile, relevant.length ? relevant : ranked, filters.query);

    await updateRun(runId, { status: 'responding' });
    const reply = buildReply(filters, matched);

    await updateRun(runId, {
      status: 'completed',
      jobs: matched,
      reply,
      sourcesQueried,
    });

    await AgentMessage.create({
      conversationId: run.conversationId,
      userId: run.userId,
      role: 'assistant',
      content: reply,
      runId: run._id.toString(),
      jobs: matched,
    });
  } catch (err) {
    console.error('[orchestrator] failed', err);
    await updateRun(runId, {
      status: 'failed',
      error: err.message || 'Agent run failed',
      reply: 'Something went wrong while searching jobs. Please try again.',
    });
  }
}

async function createApplyPack(userId, job) {
  const profile = await fetchProfile(userId);
  const jobId = job.id || `${job.source}:${job.externalId}`;

  const cached = await ApplyPack.findOne({ userId, jobId });
  if (cached) {
    return {
      jobId: cached.jobId,
      coverLetter: cached.coverLetter,
      resumeBullets: cached.resumeBullets,
      checklist: cached.checklist,
      createdAt: cached.createdAt.toISOString(),
      cached: true,
    };
  }

  const system = loadPrompt('packager');
  const user = JSON.stringify({
    profile: {
      headline: profile.headline,
      skills: profile.skills,
      experience: profile.experience,
      summary: profile.summary,
      seniority: profile.seniority,
    },
    job: {
      title: job.title,
      company: job.company,
      description: (job.description || '').slice(0, 2000),
      location: job.location,
    },
  });

  let pack;
  try {
    const result = await chatJson(system, user, { temperature: 0.4 });
    if (result._fallback) throw new Error('no llm');
    pack = {
      coverLetter: result.coverLetter || '',
      resumeBullets: result.resumeBullets || [],
      checklist: result.checklist || [],
    };
  } catch {
    const skills = (profile.skills || []).slice(0, 5).join(', ') || 'relevant technologies';
    pack = {
      coverLetter: `Dear Hiring Team at ${job.company},\n\nI am excited to apply for the ${job.title} role. My background (${profile.headline || 'software professional'}) aligns with the position, especially around ${skills}.\n\nI would welcome the chance to contribute and learn more about your team.\n\nBest regards,\n${profile.headline || 'Candidate'}`,
      resumeBullets: [
        `Delivered projects using ${skills}`,
        `Collaborated cross-functionally to ship production features`,
        `Strong fit for ${job.title} based on profile skills and experience`,
      ],
      checklist: [
        'Review the full job description on the source site',
        'Customize the top 3 resume bullets for this role',
        'Prepare 2 examples that match required skills',
        `Open apply link: ${job.applyUrl}`,
      ],
    };
  }

  const saved = await ApplyPack.findOneAndUpdate(
    { userId, jobId },
    {
      $set: {
        job,
        coverLetter: pack.coverLetter,
        resumeBullets: pack.resumeBullets,
        checklist: pack.checklist,
      },
    },
    { upsert: true, new: true }
  );

  return {
    jobId: saved.jobId,
    coverLetter: saved.coverLetter,
    resumeBullets: saved.resumeBullets,
    checklist: saved.checklist,
    createdAt: saved.createdAt.toISOString(),
    cached: false,
  };
}

module.exports = {
  runAgentPipeline,
  createApplyPack,
  fetchProfile,
  searchJobs,
  hasLlm,
};
