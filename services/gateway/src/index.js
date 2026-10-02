require('dotenv').config({ path: require('path').resolve(__dirname, '../../../.env') });
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { createProxyMiddleware } = require('http-proxy-middleware');
const crypto = require('crypto');

const PORT = Number(process.env.GATEWAY_PORT || 4000);
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5173';

const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || 'http://localhost:4001';
const PROFILE_SERVICE_URL = process.env.PROFILE_SERVICE_URL || 'http://localhost:4002';
const JOB_SERVICE_URL = process.env.JOB_SERVICE_URL || 'http://localhost:4003';
const AGENT_SERVICE_URL = process.env.AGENT_SERVICE_URL || 'http://localhost:4004';
const NOTIFICATION_SERVICE_URL =
  process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:4005';

const PUBLIC_AUTH_PATHS = new Set([
  '/api/auth/register',
  '/api/auth/login',
  '/api/auth/refresh',
  '/api/auth/logout',
]);

const app = express();

app.use(
  cors({
    origin: CORS_ORIGIN,
    credentials: true,
  })
);

app.use((req, res, next) => {
  const id = req.headers['x-correlation-id'] || crypto.randomUUID();
  req.correlationId = id;
  res.setHeader('X-Correlation-Id', id);
  next();
});

const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
});

const agentLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many agent requests, slow down' },
});

app.use(globalLimiter);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'gateway' });
});

function authMiddleware(req, res, next) {
  if (req.method === 'OPTIONS') return next();
  // req.originalUrl keeps full path when mounted; req.baseUrl+req.path also works
  const fullPath = req.originalUrl.split('?')[0];
  if (PUBLIC_AUTH_PATHS.has(fullPath)) return next();

  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.userId = payload.sub;
    req.userEmail = payload.email;
    req.userName = payload.name;
    // Set on incoming headers so http-proxy forwards them reliably
    req.headers['x-user-id'] = payload.sub;
    if (payload.email) req.headers['x-user-email'] = payload.email;
    if (payload.name) req.headers['x-user-name'] = String(payload.name);
    return next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function makeProxy(target, servicePrefix) {
  return createProxyMiddleware({
    target,
    changeOrigin: true,
    // Express strips the mount path, so /api/auth/login arrives as /login
    pathRewrite: (path) => `${servicePrefix}${path}`,
    on: {
      proxyReq: (proxyReq, req) => {
        if (req.correlationId) {
          proxyReq.setHeader('X-Correlation-Id', req.correlationId);
        }
        if (req.userId) {
          proxyReq.setHeader('X-User-Id', req.userId);
          if (req.userEmail) proxyReq.setHeader('X-User-Email', req.userEmail);
          if (req.userName) proxyReq.setHeader('X-User-Name', req.userName);
        }
      },
      error: (err, _req, res) => {
        console.error('[gateway] proxy error', err.message);
        if (res.writeHead && !res.headersSent) {
          res.writeHead(502, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Upstream service unavailable' }));
        }
      },
    },
  });
}

app.use('/api/auth', authMiddleware, makeProxy(AUTH_SERVICE_URL, '/auth'));
app.use('/api/profiles', authMiddleware, makeProxy(PROFILE_SERVICE_URL, '/profiles'));
app.use('/api/jobs', authMiddleware, makeProxy(JOB_SERVICE_URL, '/jobs'));
app.use('/api/agents', authMiddleware, agentLimiter, makeProxy(AGENT_SERVICE_URL, '/agents'));
app.use(
  '/api/notifications',
  authMiddleware,
  makeProxy(NOTIFICATION_SERVICE_URL, '/notifications')
);

app.use((err, _req, res, _next) => {
  console.error('[gateway]', err);
  res.status(500).json({ error: 'Gateway error' });
});

app.listen(PORT, () => {
  console.log(`[gateway] listening on ${PORT}`);
});
