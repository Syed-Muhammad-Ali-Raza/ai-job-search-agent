require('dotenv').config({ path: require('path').resolve(__dirname, '../../../.env') });
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const { Queue, Worker } = require('bullmq');
const IORedis = require('ioredis');
const crypto = require('crypto');
const { z } = require('zod');
const { AgentRun, AgentMessage, ApplyPack, RadarSubscription } = require('./models');
const { runAgentPipeline, createApplyPack } = require('./orchestrator');
const { startRadarCron, runAllRadar } = require('./radar');

const PORT = Number(process.env.AGENT_PORT || 4004);
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/career-copilot';
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

const ChatRequestSchema = z.object({
  message: z.string().min(1).max(4000),
  conversationId: z.string().optional(),
});

function requireUser(req, res) {
  const userId = req.headers['x-user-id'];
  if (!userId) {
    res.status(401).json({ error: 'Missing X-User-Id' });
    return null;
  }
  return userId;
}

function toRun(doc) {
  return {
    id: doc._id.toString(),
    userId: doc.userId,
    conversationId: doc.conversationId,
    status: doc.status,
    message: doc.message,
    filters: doc.filters,
    jobs: doc.jobs || [],
    reply: doc.reply || '',
    error: doc.error,
    sourcesQueried: doc.sourcesQueried || [],
    createdAt: doc.createdAt?.toISOString?.() || doc.createdAt,
    updatedAt: doc.updatedAt?.toISOString?.() || doc.updatedAt,
  };
}

let agentQueue = null;
let connection = null;
let useInline = false;

async function enqueueRun(runId) {
  if (useInline || !agentQueue) {
    setImmediate(() => {
      runAgentPipeline(runId).catch((err) => console.error(err));
    });
    return;
  }
  await agentQueue.add('agent-run', { runId }, { removeOnComplete: 100, removeOnFail: 50 });
}

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'agent-service',
    queueMode: useInline ? 'inline' : 'bullmq',
  });
});

app.post('/agents/chat', async (req, res) => {
  try {
    const userId = requireUser(req, res);
    if (!userId) return;
    const body = ChatRequestSchema.parse(req.body);
    const conversationId = body.conversationId || crypto.randomUUID();

    await AgentMessage.create({
      conversationId,
      userId,
      role: 'user',
      content: body.message,
    });

    const run = await AgentRun.create({
      userId,
      conversationId,
      status: 'queued',
      message: body.message,
    });

    await enqueueRun(run._id.toString());

    return res.status(202).json({
      runId: run._id.toString(),
      conversationId,
      status: 'queued',
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid input', details: err.flatten() });
    }
    console.error(err);
    return res.status(500).json({ error: 'Chat failed' });
  }
});

app.get('/agents/runs/:id', async (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const run = await AgentRun.findById(req.params.id);
  if (!run || run.userId !== userId) {
    return res.status(404).json({ error: 'Run not found' });
  }
  return res.json({ run: toRun(run) });
});

app.get('/agents/runs', async (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const runs = await AgentRun.find({ userId }).sort({ createdAt: -1 }).limit(30);
  return res.json({ runs: runs.map(toRun) });
});

app.get('/agents/conversations/:id/messages', async (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const messages = await AgentMessage.find({
    conversationId: req.params.id,
    userId,
  })
    .sort({ createdAt: 1 })
    .limit(200);
  return res.json({
    messages: messages.map((m) => ({
      id: m._id.toString(),
      role: m.role,
      content: m.content,
      jobs: m.jobs || [],
      runId: m.runId,
      createdAt: m.createdAt?.toISOString?.() || m.createdAt,
    })),
  });
});

app.post('/agents/apply-pack', async (req, res) => {
  try {
    const userId = requireUser(req, res);
    if (!userId) return;
    const job = req.body.job;
    if (!job || !job.title) {
      return res.status(400).json({ error: 'job object required' });
    }
    const pack = await createApplyPack(userId, job);
    return res.json({ pack });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Apply pack failed' });
  }
});

app.get('/agents/apply-packs', async (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const packs = await ApplyPack.find({ userId }).sort({ updatedAt: -1 }).limit(50);
  return res.json({
    packs: packs.map((p) => ({
      jobId: p.jobId,
      job: p.job,
      coverLetter: p.coverLetter,
      resumeBullets: p.resumeBullets,
      checklist: p.checklist,
      createdAt: p.createdAt?.toISOString?.() || p.createdAt,
    })),
  });
});

app.get('/agents/radar', async (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  let sub = await RadarSubscription.findOne({ userId });
  if (!sub) {
    sub = await RadarSubscription.create({ userId, enabled: true });
  }
  return res.json({
    subscription: {
      enabled: sub.enabled,
      query: sub.query,
      remote: sub.remote,
      lastRunAt: sub.lastRunAt,
      lastNotifiedAt: sub.lastNotifiedAt,
    },
  });
});

app.put('/agents/radar', async (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const sub = await RadarSubscription.findOneAndUpdate(
    { userId },
    {
      $set: {
        enabled: req.body.enabled !== false,
        query: req.body.query || '',
        remote: req.body.remote !== false,
      },
    },
    { upsert: true, new: true }
  );
  return res.json({
    subscription: {
      enabled: sub.enabled,
      query: sub.query,
      remote: sub.remote,
      lastRunAt: sub.lastRunAt,
      lastNotifiedAt: sub.lastNotifiedAt,
    },
  });
});

app.post('/agents/radar/run', async (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  // Allow manual trigger for demo
  await runAllRadar();
  return res.json({ ok: true });
});

async function start() {
  await mongoose.connect(MONGODB_URI);
  console.log('[agent-service] MongoDB connected');

  try {
    connection = new IORedis(REDIS_URL, {
      maxRetriesPerRequest: null,
      lazyConnect: true,
    });
    await connection.connect();
    agentQueue = new Queue('agent-runs', { connection });
    // eslint-disable-next-line no-new
    new Worker(
      'agent-runs',
      async (job) => {
        await runAgentPipeline(job.data.runId);
      },
      { connection: connection.duplicate() }
    );
    console.log('[agent-service] BullMQ worker ready');
  } catch (err) {
    console.warn('[agent-service] Redis/BullMQ unavailable, using inline queue', err.message);
    useInline = true;
    agentQueue = null;
  }

  startRadarCron();

  app.listen(PORT, () => {
    console.log(`[agent-service] listening on ${PORT}`);
  });
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
