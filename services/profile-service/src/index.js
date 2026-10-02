require('dotenv').config({ path: require('path').resolve(__dirname, '../../../.env') });
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { z } = require('zod');
const { Profile, SavedJob } = require('./models');
const { llmExtract, extractTextFromUpload } = require('./profiler');

const PORT = Number(process.env.PROFILE_PORT || 4002);
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/career-copilot';

const uploadDir = path.join(__dirname, '../uploads');
fs.mkdirSync(uploadDir, { recursive: true });

const upload = multer({
  dest: uploadDir,
  limits: { fileSize: 5 * 1024 * 1024 },
});

const ProfileUpdateSchema = z.object({
  headline: z.string().optional(),
  summary: z.string().optional(),
  skills: z.array(z.string()).optional(),
  experience: z
    .array(
      z.object({
        title: z.string(),
        company: z.string().optional(),
        years: z.number().optional(),
        summary: z.string().optional(),
      })
    )
    .optional(),
  locations: z.array(z.string()).optional(),
  remotePreference: z.enum(['remote', 'hybrid', 'onsite', 'any']).optional(),
  salaryMin: z.number().optional(),
  salaryMax: z.number().optional(),
  seniority: z.string().optional(),
  targetTitles: z.array(z.string()).optional(),
  visaPrefs: z.string().optional(),
});

function requireUser(req, res) {
  const userId = req.headers['x-user-id'];
  if (!userId) {
    res.status(401).json({ error: 'Missing X-User-Id' });
    return null;
  }
  return userId;
}

function toPublicProfile(doc) {
  if (!doc) return null;
  const o = doc.toObject ? doc.toObject() : doc;
  return {
    userId: o.userId,
    headline: o.headline || '',
    summary: o.summary || '',
    skills: o.skills || [],
    experience: o.experience || [],
    locations: o.locations || [],
    remotePreference: o.remotePreference || 'any',
    salaryMin: o.salaryMin,
    salaryMax: o.salaryMax,
    seniority: o.seniority || '',
    targetTitles: o.targetTitles || [],
    visaPrefs: o.visaPrefs || '',
    updatedAt: o.updatedAt,
  };
}

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'profile-service' });
});

app.get('/profiles/me', async (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  let profile = await Profile.findOne({ userId });
  if (!profile) {
    profile = await Profile.create({ userId });
  }
  return res.json({ profile: toPublicProfile(profile) });
});

app.put('/profiles/me', async (req, res) => {
  try {
    const userId = requireUser(req, res);
    if (!userId) return;
    const body = ProfileUpdateSchema.parse(req.body);
    const profile = await Profile.findOneAndUpdate(
      { userId },
      { $set: body },
      { upsert: true, new: true }
    );
    return res.json({ profile: toPublicProfile(profile) });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid input', details: err.flatten() });
    }
    console.error(err);
    return res.status(500).json({ error: 'Update failed' });
  }
});

function maybeUpload(req, res, next) {
  const contentType = req.headers['content-type'] || '';
  if (contentType.includes('multipart/form-data')) {
    return upload.single('resume')(req, res, next);
  }
  return next();
}

app.post('/profiles/from-resume', maybeUpload, async (req, res) => {
  let filePath = null;
  try {
    const userId = requireUser(req, res);
    if (!userId) return;

    let text = '';
    if (req.file) {
      filePath = req.file.path;
      text = await extractTextFromUpload(req.file);
    } else if (req.body?.text) {
      text = String(req.body.text);
    } else {
      return res.status(400).json({ error: 'Provide resume file or text' });
    }

    if (!text.trim()) {
      return res.status(400).json({ error: 'Could not extract text from resume' });
    }

    const extracted = await llmExtract(text);
    const { _meta, ...fields } = extracted;
    const profile = await Profile.findOneAndUpdate(
      { userId },
      { $set: fields },
      { upsert: true, new: true }
    );

    return res.json({
      profile: toPublicProfile(profile),
      meta: _meta,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Resume profiling failed' });
  } finally {
    if (filePath) {
      fs.unlink(filePath, () => {});
    }
  }
});

app.get('/profiles/saved-jobs', async (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const items = await SavedJob.find({ userId }).sort({ createdAt: -1 }).limit(100);
  return res.json({
    items: items.map((s) => ({
      id: s._id.toString(),
      userId: s.userId,
      job: s.job,
      fitScore: s.fitScore,
      reasons: s.reasons || [],
      createdAt: s.createdAt?.toISOString?.() || s.createdAt,
    })),
  });
});

app.post('/profiles/saved-jobs', async (req, res) => {
  try {
    const userId = requireUser(req, res);
    if (!userId) return;
    const job = req.body.job;
    if (!job || !job.externalId || !job.source) {
      return res.status(400).json({ error: 'job with source and externalId required' });
    }
    const saved = await SavedJob.findOneAndUpdate(
      { userId, 'job.externalId': job.externalId, 'job.source': job.source },
      {
        $set: {
          job,
          fitScore: req.body.fitScore,
          reasons: req.body.reasons || [],
        },
      },
      { upsert: true, new: true }
    );
    return res.status(201).json({
      item: {
        id: saved._id.toString(),
        userId: saved.userId,
        job: saved.job,
        fitScore: saved.fitScore,
        reasons: saved.reasons || [],
        createdAt: saved.createdAt?.toISOString?.() || saved.createdAt,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Save failed' });
  }
});

app.delete('/profiles/saved-jobs/:id', async (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  await SavedJob.deleteOne({ _id: req.params.id, userId });
  return res.json({ ok: true });
});

// Internal: used by agent-service
app.get('/profiles/internal/:userId', async (req, res) => {
  const profile = await Profile.findOne({ userId: req.params.userId });
  if (!profile) {
    return res.json({ profile: { userId: req.params.userId, skills: [], targetTitles: [] } });
  }
  return res.json({ profile: toPublicProfile(profile) });
});

async function start() {
  await mongoose.connect(MONGODB_URI);
  console.log('[profile-service] MongoDB connected');
  app.listen(PORT, () => {
    console.log(`[profile-service] listening on ${PORT}`);
  });
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
