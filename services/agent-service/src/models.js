const mongoose = require('mongoose');

const agentRunSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    conversationId: { type: String, index: true },
    status: {
      type: String,
      enum: ['queued', 'planning', 'scouting', 'matching', 'responding', 'completed', 'failed'],
      default: 'queued',
    },
    message: { type: String, required: true },
    filters: mongoose.Schema.Types.Mixed,
    jobs: { type: [mongoose.Schema.Types.Mixed], default: [] },
    reply: { type: String, default: '' },
    error: String,
    sourcesQueried: { type: [String], default: [] },
  },
  { timestamps: true, collection: 'agent_runs' }
);

const messageSchema = new mongoose.Schema(
  {
    conversationId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    role: { type: String, enum: ['user', 'assistant', 'system'], required: true },
    content: { type: String, required: true },
    runId: String,
    jobs: [mongoose.Schema.Types.Mixed],
  },
  { timestamps: true, collection: 'agent_messages' }
);

const applyPackSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    jobId: { type: String, required: true },
    job: mongoose.Schema.Types.Mixed,
    coverLetter: String,
    resumeBullets: [String],
    checklist: [String],
  },
  { timestamps: true, collection: 'agent_apply_packs' }
);
applyPackSchema.index({ userId: 1, jobId: 1 }, { unique: true });

const radarSubscriptionSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, unique: true },
    enabled: { type: Boolean, default: true },
    query: { type: String, default: '' },
    remote: { type: Boolean, default: true },
    lastRunAt: Date,
    lastNotifiedAt: Date,
  },
  { timestamps: true, collection: 'agent_radar_subscriptions' }
);

const AgentRun = mongoose.model('AgentRun', agentRunSchema);
const AgentMessage = mongoose.model('AgentMessage', messageSchema);
const ApplyPack = mongoose.model('ApplyPack', applyPackSchema);
const RadarSubscription = mongoose.model('RadarSubscription', radarSubscriptionSchema);

module.exports = { AgentRun, AgentMessage, ApplyPack, RadarSubscription };
