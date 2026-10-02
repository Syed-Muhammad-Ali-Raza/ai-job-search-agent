require('dotenv').config({ path: require('path').resolve(__dirname, '../../../.env') });
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { z } = require('zod');
const { User, RefreshToken } = require('./models');

const PORT = Number(process.env.AUTH_PORT || 4001);
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/career-copilot';
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '15m';
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '7d';

const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1).max(120),
});

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

function signAccessToken(user) {
  return jwt.sign(
    { sub: user._id.toString(), email: user.email, name: user.name },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function parseDurationToMs(value) {
  const match = /^(\d+)([smhd])$/.exec(value);
  if (!match) return 7 * 24 * 60 * 60 * 1000;
  const n = Number(match[1]);
  const unit = match[2];
  const map = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
  return n * map[unit];
}

async function issueRefreshToken(userId) {
  const token = crypto.randomBytes(48).toString('hex');
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + parseDurationToMs(JWT_REFRESH_EXPIRES_IN));
  await RefreshToken.create({ userId, tokenHash, expiresAt });
  return token;
}

function publicUser(user) {
  return { id: user._id.toString(), email: user.email, name: user.name };
}

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'auth-service' });
});

app.post('/auth/register', async (req, res) => {
  try {
    const body = RegisterSchema.parse(req.body);
    const existing = await User.findOne({ email: body.email.toLowerCase() });
    if (existing) {
      return res.status(409).json({ error: 'Email already registered' });
    }
    const passwordHash = await bcrypt.hash(body.password, 10);
    const user = await User.create({
      email: body.email.toLowerCase(),
      passwordHash,
      name: body.name,
    });
    const accessToken = signAccessToken(user);
    const refreshToken = await issueRefreshToken(user._id);
    return res.status(201).json({
      accessToken,
      refreshToken,
      user: publicUser(user),
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid input', details: err.flatten() });
    }
    console.error(err);
    return res.status(500).json({ error: 'Registration failed' });
  }
});

app.post('/auth/login', async (req, res) => {
  try {
    const body = LoginSchema.parse(req.body);
    const user = await User.findOne({ email: body.email.toLowerCase() });
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    const ok = await bcrypt.compare(body.password, user.passwordHash);
    if (!ok) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    const accessToken = signAccessToken(user);
    const refreshToken = await issueRefreshToken(user._id);
    return res.json({
      accessToken,
      refreshToken,
      user: publicUser(user),
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid input', details: err.flatten() });
    }
    console.error(err);
    return res.status(500).json({ error: 'Login failed' });
  }
});

app.post('/auth/refresh', async (req, res) => {
  try {
    const refreshToken = req.body.refreshToken;
    if (!refreshToken || typeof refreshToken !== 'string') {
      return res.status(400).json({ error: 'refreshToken required' });
    }
    const tokenHash = hashToken(refreshToken);
    const stored = await RefreshToken.findOne({ tokenHash });
    if (!stored || stored.expiresAt < new Date()) {
      return res.status(401).json({ error: 'Invalid refresh token' });
    }
    const user = await User.findById(stored.userId);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }
    await RefreshToken.deleteOne({ _id: stored._id });
    const accessToken = signAccessToken(user);
    const newRefresh = await issueRefreshToken(user._id);
    return res.json({
      accessToken,
      refreshToken: newRefresh,
      user: publicUser(user),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Refresh failed' });
  }
});

app.post('/auth/logout', async (req, res) => {
  try {
    const refreshToken = req.body.refreshToken;
    if (refreshToken) {
      await RefreshToken.deleteOne({ tokenHash: hashToken(refreshToken) });
    }
    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Logout failed' });
  }
});

app.get('/auth/me', async (req, res) => {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const payload = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(payload.sub);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    return res.json({ user: publicUser(user) });
  } catch {
    return res.status(401).json({ error: 'Unauthorized' });
  }
});

async function start() {
  await mongoose.connect(MONGODB_URI);
  console.log('[auth-service] MongoDB connected');
  app.listen(PORT, () => {
    console.log(`[auth-service] listening on ${PORT}`);
  });
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
