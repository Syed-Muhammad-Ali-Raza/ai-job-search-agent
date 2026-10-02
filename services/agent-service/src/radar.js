const cron = require('node-cron');
const { RadarSubscription, AgentMessage } = require('./models');
const { fetchProfile, searchJobs } = require('./orchestrator');
const { skillOverlapScore } = require('./llm');

const NOTIFICATION_SERVICE_URL =
  process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:4005';

async function notifyUser(userId, title, body, meta = {}) {
  try {
    await fetch(`${NOTIFICATION_SERVICE_URL}/notifications/internal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, title, body, meta }),
    });
  } catch (err) {
    console.warn('[radar] notify failed', err.message);
  }
}

async function runRadarForUser(sub) {
  const profile = await fetchProfile(sub.userId);
  const query =
    sub.query ||
    profile.targetTitles?.[0] ||
    profile.skills?.slice(0, 3).join(' ') ||
    'software engineer';

  const search = await searchJobs({
    query,
    location: profile.locations?.[0] || '',
    remote: sub.remote !== false,
    limit: 25,
  });

  const scored = (search.jobs || [])
    .map((job) => ({ job, score: skillOverlapScore(profile, job) }))
    .filter((x) => x.score >= 40)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);

  await RadarSubscription.updateOne(
    { _id: sub._id },
    { $set: { lastRunAt: new Date() } }
  );

  if (!scored.length) return { count: 0 };

  const title = `Radar found ${scored.length} new matches`;
  const body = scored
    .slice(0, 5)
    .map((x) => `${x.job.title} @ ${x.job.company} (fit ~${x.score})`)
    .join('\n');

  await notifyUser(sub.userId, title, body, {
    jobs: scored.map((x) => x.job),
    query,
  });

  await AgentMessage.create({
    conversationId: `radar:${sub.userId}`,
    userId: sub.userId,
    role: 'assistant',
    content: `${title}\n\n${body}`,
    jobs: scored.map((x) => ({
      ...x.job,
      fitScore: x.score,
      reasons: ['Radar match based on your profile'],
    })),
  });

  await RadarSubscription.updateOne(
    { _id: sub._id },
    { $set: { lastNotifiedAt: new Date() } }
  );

  return { count: scored.length };
}

async function runAllRadar() {
  const subs = await RadarSubscription.find({ enabled: true });
  console.log(`[radar] running for ${subs.length} subscriptions`);
  for (const sub of subs) {
    try {
      await runRadarForUser(sub);
    } catch (err) {
      console.error('[radar] user failed', sub.userId, err.message);
    }
  }
}

function startRadarCron() {
  // Every day at 9:00 AM server time
  cron.schedule('0 9 * * *', () => {
    runAllRadar().catch((err) => console.error('[radar] cron', err));
  });
  console.log('[radar] cron scheduled (daily 09:00)');
}

module.exports = { startRadarCron, runAllRadar, runRadarForUser };
