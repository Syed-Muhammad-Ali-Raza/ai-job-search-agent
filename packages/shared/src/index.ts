import { z } from 'zod';

export const JobListingSchema = z.object({
  id: z.string(),
  title: z.string(),
  company: z.string(),
  location: z.string().optional().default(''),
  description: z.string().optional().default(''),
  applyUrl: z.string().url().or(z.string()),
  source: z.enum(['remotive', 'adzuna', 'manual']),
  externalId: z.string(),
  postedAt: z.string().optional(),
  salary: z.string().optional(),
  tags: z.array(z.string()).optional().default([]),
  remote: z.boolean().optional().default(false),
});

export type JobListing = z.infer<typeof JobListingSchema>;

export const MatchedJobSchema = JobListingSchema.extend({
  fitScore: z.number().min(0).max(100),
  reasons: z.array(z.string()).max(5),
});

export type MatchedJob = z.infer<typeof MatchedJobSchema>;

export const ExperienceItemSchema = z.object({
  title: z.string(),
  company: z.string().optional().default(''),
  years: z.number().optional(),
  summary: z.string().optional().default(''),
});

export const ProfileSchema = z.object({
  userId: z.string(),
  headline: z.string().optional().default(''),
  summary: z.string().optional().default(''),
  skills: z.array(z.string()).default([]),
  experience: z.array(ExperienceItemSchema).default([]),
  locations: z.array(z.string()).default([]),
  remotePreference: z.enum(['remote', 'hybrid', 'onsite', 'any']).default('any'),
  salaryMin: z.number().optional(),
  salaryMax: z.number().optional(),
  seniority: z.string().optional().default(''),
  targetTitles: z.array(z.string()).default([]),
  visaPrefs: z.string().optional().default(''),
});

export type Profile = z.infer<typeof ProfileSchema>;

export const ProfileUpdateSchema = ProfileSchema.omit({ userId: true }).partial();

export const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1).max(120),
});

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const AuthTokensSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  user: z.object({
    id: z.string(),
    email: z.string().email(),
    name: z.string(),
  }),
});

export type AuthTokens = z.infer<typeof AuthTokensSchema>;

export const PlannerFiltersSchema = z.object({
  intent: z.enum(['search_jobs', 'clarify', 'apply_pack', 'general']),
  query: z.string().optional().default(''),
  location: z.string().optional().default(''),
  remote: z.boolean().optional().default(true),
  limit: z.number().int().min(1).max(50).optional().default(30),
  reply: z.string().optional(),
});

export type PlannerFilters = z.infer<typeof PlannerFiltersSchema>;

export const AgentRunStatusSchema = z.enum([
  'queued',
  'planning',
  'scouting',
  'matching',
  'responding',
  'completed',
  'failed',
]);

export type AgentRunStatus = z.infer<typeof AgentRunStatusSchema>;

export const AgentRunSchema = z.object({
  id: z.string(),
  userId: z.string(),
  status: AgentRunStatusSchema,
  message: z.string(),
  filters: PlannerFiltersSchema.optional(),
  jobs: z.array(MatchedJobSchema).optional().default([]),
  reply: z.string().optional().default(''),
  error: z.string().optional(),
  sourcesQueried: z.array(z.string()).optional().default([]),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type AgentRun = z.infer<typeof AgentRunSchema>;

export const ChatRequestSchema = z.object({
  message: z.string().min(1).max(4000),
  conversationId: z.string().optional(),
});

export const ApplyPackRequestSchema = z.object({
  jobId: z.string().min(1),
  job: JobListingSchema.optional(),
});

export const ApplyPackSchema = z.object({
  jobId: z.string(),
  coverLetter: z.string(),
  resumeBullets: z.array(z.string()),
  checklist: z.array(z.string()),
  createdAt: z.string(),
});

export type ApplyPack = z.infer<typeof ApplyPackSchema>;

export const SavedJobSchema = z.object({
  id: z.string(),
  userId: z.string(),
  job: JobListingSchema,
  fitScore: z.number().optional(),
  reasons: z.array(z.string()).optional(),
  createdAt: z.string(),
});

export type SavedJob = z.infer<typeof SavedJobSchema>;

export const JobSearchQuerySchema = z.object({
  q: z.string().optional().default('software engineer'),
  location: z.string().optional().default(''),
  remote: z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((v) => {
      if (typeof v === 'boolean') return v;
      if (v === undefined || v === '') return undefined;
      return v === 'true' || v === '1';
    }),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
});

export type JobSearchQuery = z.infer<typeof JobSearchQuerySchema>;

export const ApiErrorSchema = z.object({
  error: z.string(),
  details: z.unknown().optional(),
});
