require('dotenv').config({ path: require('path').resolve(__dirname, '../../../.env') });
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const Redis = require('ioredis');
const { z } = require('zod');
const { searchRemotive, searchAdzuna } = require('./providers');

const PORT = Number(process.env.JOB_PORT || 4003);
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/career-copilot';
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const CACHE_TTL = 30 * 60;

const JobSearchQuerySchema = z.object({
  q: z.string().optional().default('software engineer'),
  location: z.string().optional().default(''),
  remote: z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((v) => {
      if (typeof v === 'boolean') return v;
      if (v === undefined || v === '') return true;
      return v === 'true' || v === '1';
    }),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
});

const jobSnapshotSchema = new mongoose.Schema(
  {
    source: String,
    externalId: String,
    listing: mongoose.Schema.Types.Mixed,
    firstSeenAt: { type: Date, default: Date.now },
    lastSeenAt: { type: Date, default: Date.now },
  },
  { collection: 'job_snapshots' }
);
jobSnapshotSchema.index({ source: 1, externalId: 1 }, { unique: true });
const JobSnapshot = mongoose.model('JobSnapshot', jobSnapshotSchema);

let redis;
try {
  redis = new Redis(REDIS_URL, {
    maxRetriesPerRequest: 1,
    lazyConnect: true,
  });
  redis.on('error', (err) => {
    console.warn('[job-service] redis error', err.message);
  });
} catch (err) {
  console.warn('[job-service] redis init failed', err.message);
  redis = null;
}

function cacheKey(params) {
  return `jobs:search:${JSON.stringify(params)}`;
}

function dedupeJobs(jobs) {
  const seen = new Set();
  const out = [];
  for (const job of jobs) {
    const key = `${job.source}:${job.externalId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(job);
  }
  return out;
}

async function persistSnapshots(jobs) {
  const ops = jobs.map((job) => ({
    updateOne: {
      filter: { source: job.source, externalId: job.externalId },
      update: {
        $set: { listing: job, lastSeenAt: new Date() },
        $setOnInsert: { firstSeenAt: new Date() },
      },
      upsert: true,
    },
  }));
  if (ops.length) {
    await JobSnapshot.bulkWrite(ops, { ordered: false }).catch((err) => {
      console.warn('[job-service] snapshot write', err.message);
    });
  }
}

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'job-service' });
});

app.get('/jobs/search', async (req, res) => {
  try {
    const query = JobSearchQuerySchema.parse(req.query);
    const key = cacheKey(query);

    if (redis) {
      try {
        if (redis.status !== 'ready') await redis.connect().catch(() => {});
        const cached = await redis.get(key);
        if (cached) {
          return res.json({ ...JSON.parse(cached), cached: true });
        }
      } catch (err) {
        console.warn('[job-service] cache read failed', err.message);
      }
    }

    const sourcesQueried = [];
    let jobs = [];

    try {
      const remotiveJobs = await searchRemotive({
        q: query.q,
        remote: query.remote,
        limit: query.limit,
      });
      jobs = jobs.concat(remotiveJobs);
      sourcesQueried.push('remotive');
    } catch (err) {
      console.error('[job-service] remotive', err.message);
    }

    try {
      const adzuna = await searchAdzuna({
        q: query.q,
        location: query.location,
        remote: query.remote,
        page: query.page,
        limit: query.limit,
      });
      if (!adzuna.skipped) {
        jobs = jobs.concat(adzuna.jobs);
        sourcesQueried.push('adzuna');
      }
    } catch (err) {
      console.error('[job-service] adzuna', err.message);
    }

    jobs = dedupeJobs(jobs).slice(0, query.limit);
    await persistSnapshots(jobs);

    const payload = {
      jobs,
      total: jobs.length,
      page: query.page,
      sourcesQueried,
      cached: false,
    };

    if (redis) {
      try {
        await redis.setex(key, CACHE_TTL, JSON.stringify(payload));
      } catch (err) {
        console.warn('[job-service] cache write failed', err.message);
      }
    }

    return res.json(payload);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid query', details: err.flatten() });
    }
    console.error(err);
    return res.status(500).json({ error: 'Job search failed' });
  }
});

app.get('/jobs/:source/:externalId', async (req, res) => {
  const snap = await JobSnapshot.findOne({
    source: req.params.source,
    externalId: req.params.externalId,
  });
  if (!snap) return res.status(404).json({ error: 'Job not found' });
  return res.json({ job: snap.listing });
});

// Radar helper: jobs first seen since timestamp
app.get('/jobs/internal/new-since', async (req, res) => {
  const since = req.query.since ? new Date(String(req.query.since)) : new Date(Date.now() - 86400000);
  const q = String(req.query.q || '');
  const snaps = await JobSnapshot.find({ firstSeenAt: { $gte: since } })
    .sort({ firstSeenAt: -1 })
    .limit(50);
  let jobs = snaps.map((s) => s.listing);
  if (q) {
    const lower = q.toLowerCase();
    jobs = jobs.filter(
      (j) =>
        (j.title || '').toLowerCase().includes(lower) ||
        (j.description || '').toLowerCase().includes(lower) ||
        (j.tags || []).some((t) => String(t).toLowerCase().includes(lower))
    );
  }
  return res.json({ jobs, since: since.toISOString() });
});

async function start() {
  await mongoose.connect(MONGODB_URI);
  console.log('[job-service] MongoDB connected');
  if (redis) {
    try {
      await redis.connect();
      console.log('[job-service] Redis connected');
    } catch (err) {
      console.warn('[job-service] Redis unavailable, continuing without cache', err.message);
    }
  }
  app.listen(PORT, () => {
    console.log(`[job-service] listening on ${PORT}`);
  });
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
