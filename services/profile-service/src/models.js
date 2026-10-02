const mongoose = require('mongoose');

const experienceSchema = new mongoose.Schema(
  {
    title: String,
    company: { type: String, default: '' },
    years: Number,
    summary: { type: String, default: '' },
  },
  { _id: false }
);

const profileSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, unique: true, index: true },
    headline: { type: String, default: '' },
    summary: { type: String, default: '' },
    skills: { type: [String], default: [] },
    experience: { type: [experienceSchema], default: [] },
    locations: { type: [String], default: [] },
    remotePreference: {
      type: String,
      enum: ['remote', 'hybrid', 'onsite', 'any'],
      default: 'any',
    },
    salaryMin: Number,
    salaryMax: Number,
    seniority: { type: String, default: '' },
    targetTitles: { type: [String], default: [] },
    visaPrefs: { type: String, default: '' },
  },
  { timestamps: true, collection: 'profile_profiles' }
);

const savedJobSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    job: { type: mongoose.Schema.Types.Mixed, required: true },
    fitScore: Number,
    reasons: [String],
  },
  { timestamps: true, collection: 'profile_saved_jobs' }
);

savedJobSchema.index({ userId: 1, 'job.externalId': 1, 'job.source': 1 }, { unique: true });

const Profile = mongoose.model('Profile', profileSchema);
const SavedJob = mongoose.model('SavedJob', savedJobSchema);

module.exports = { Profile, SavedJob };
