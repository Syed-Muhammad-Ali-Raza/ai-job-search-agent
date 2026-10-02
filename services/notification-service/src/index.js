require('dotenv').config({ path: require('path').resolve(__dirname, '../../../.env') });
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const nodemailer = require('nodemailer');

const PORT = Number(process.env.NOTIFICATION_PORT || 4005);
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/career-copilot';

const notificationSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    title: { type: String, required: true },
    body: { type: String, required: true },
    meta: mongoose.Schema.Types.Mixed,
    read: { type: Boolean, default: false },
    emailed: { type: Boolean, default: false },
  },
  { timestamps: true, collection: 'notification_items' }
);

const Notification = mongoose.model('Notification', notificationSchema);

function createTransport() {
  if (!process.env.SMTP_HOST) return null;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: false,
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  });
}

const transporter = createTransport();

function requireUser(req, res) {
  const userId = req.headers['x-user-id'];
  if (!userId) {
    res.status(401).json({ error: 'Missing X-User-Id' });
    return null;
  }
  return userId;
}

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'notification-service', emailEnabled: Boolean(transporter) });
});

app.post('/notifications/internal', async (req, res) => {
  try {
    const { userId, title, body, meta, email } = req.body;
    if (!userId || !title || !body) {
      return res.status(400).json({ error: 'userId, title, body required' });
    }
    const item = await Notification.create({ userId, title, body, meta });

    let emailed = false;
    if (transporter && email) {
      try {
        await transporter.sendMail({
          from: process.env.EMAIL_FROM || 'Career Copilot <noreply@careercopilot.local>',
          to: email,
          subject: title,
          text: body,
        });
        emailed = true;
        item.emailed = true;
        await item.save();
      } catch (err) {
        console.warn('[notification] email failed', err.message);
      }
    }

    return res.status(201).json({
      notification: {
        id: item._id.toString(),
        userId: item.userId,
        title: item.title,
        body: item.body,
        read: item.read,
        emailed,
        createdAt: item.createdAt.toISOString(),
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Create notification failed' });
  }
});

app.get('/notifications', async (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const items = await Notification.find({ userId }).sort({ createdAt: -1 }).limit(50);
  return res.json({
    notifications: items.map((n) => ({
      id: n._id.toString(),
      title: n.title,
      body: n.body,
      meta: n.meta,
      read: n.read,
      createdAt: n.createdAt.toISOString(),
    })),
  });
});

app.post('/notifications/:id/read', async (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  await Notification.updateOne({ _id: req.params.id, userId }, { $set: { read: true } });
  return res.json({ ok: true });
});

async function start() {
  await mongoose.connect(MONGODB_URI);
  console.log('[notification-service] MongoDB connected');
  app.listen(PORT, () => {
    console.log(`[notification-service] listening on ${PORT}`);
  });
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
