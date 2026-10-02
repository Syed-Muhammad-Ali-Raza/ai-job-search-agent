const API_BASE = import.meta.env.VITE_API_URL || '/api';

export type User = { id: string; email: string; name: string };

export type JobListing = {
  id: string;
  title: string;
  company: string;
  location?: string;
  description?: string;
  applyUrl: string;
  source: string;
  externalId: string;
  postedAt?: string;
  salary?: string;
  tags?: string[];
  remote?: boolean;
  fitScore?: number;
  reasons?: string[];
};

export type Profile = {
  userId: string;
  headline: string;
  summary: string;
  skills: string[];
  experience: Array<{ title: string; company?: string; years?: number; summary?: string }>;
  locations: string[];
  remotePreference: 'remote' | 'hybrid' | 'onsite' | 'any';
  salaryMin?: number;
  salaryMax?: number;
  seniority: string;
  targetTitles: string[];
  visaPrefs: string;
};

export type AgentRun = {
  id: string;
  status: string;
  message: string;
  reply?: string;
  jobs?: JobListing[];
  sourcesQueried?: string[];
  error?: string;
  createdAt: string;
  updatedAt: string;
  conversationId?: string;
};

function getTokens() {
  return {
    accessToken: localStorage.getItem('accessToken'),
    refreshToken: localStorage.getItem('refreshToken'),
  };
}

export function setTokens(accessToken: string, refreshToken: string) {
  localStorage.setItem('accessToken', accessToken);
  localStorage.setItem('refreshToken', refreshToken);
}

export function clearTokens() {
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('user');
}

export function getStoredUser(): User | null {
  const raw = localStorage.getItem('user');
  if (!raw) return null;
  try {
    return JSON.parse(raw) as User;
  } catch {
    return null;
  }
}

export function setStoredUser(user: User) {
  localStorage.setItem('user', JSON.stringify(user));
}

async function refreshAccessToken(): Promise<string | null> {
  const { refreshToken } = getTokens();
  if (!refreshToken) return null;
  const res = await fetch(`${API_BASE}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });
  if (!res.ok) {
    clearTokens();
    return null;
  }
  const data = await res.json();
  setTokens(data.accessToken, data.refreshToken);
  if (data.user) setStoredUser(data.user);
  return data.accessToken as string;
}

export async function api<T>(
  path: string,
  options: RequestInit = {},
  retry = true
): Promise<T> {
  const { accessToken } = getTokens();
  const headers = new Headers(options.headers || {});
  if (!(options.body instanceof FormData) && !headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (res.status === 401 && retry) {
    const next = await refreshAccessToken();
    if (next) return api<T>(path, options, false);
    throw new Error('Unauthorized');
  }

  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data as T;
}

export const authApi = {
  register: (body: { email: string; password: string; name: string }) =>
    api<{ accessToken: string; refreshToken: string; user: User }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  login: (body: { email: string; password: string }) =>
    api<{ accessToken: string; refreshToken: string; user: User }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  me: () => api<{ user: User }>('/auth/me'),
  logout: async () => {
    const { refreshToken } = getTokens();
    try {
      await api('/auth/logout', {
        method: 'POST',
        body: JSON.stringify({ refreshToken }),
      });
    } finally {
      clearTokens();
    }
  },
};

export const profileApi = {
  get: () => api<{ profile: Profile }>('/profiles/me'),
  update: (body: Partial<Profile>) =>
    api<{ profile: Profile }>('/profiles/me', {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  fromResume: (form: FormData) =>
    api<{ profile: Profile; meta?: { method: string } }>('/profiles/from-resume', {
      method: 'POST',
      body: form,
    }),
  fromResumeText: (text: string) =>
    api<{ profile: Profile; meta?: { method: string } }>('/profiles/from-resume', {
      method: 'POST',
      body: JSON.stringify({ text }),
    }),
  savedJobs: () =>
    api<{
      items: Array<{
        id: string;
        job: JobListing;
        fitScore?: number;
        reasons?: string[];
        createdAt: string;
      }>;
    }>('/profiles/saved-jobs'),
  saveJob: (job: JobListing, fitScore?: number, reasons?: string[]) =>
    api('/profiles/saved-jobs', {
      method: 'POST',
      body: JSON.stringify({ job, fitScore, reasons }),
    }),
  unsaveJob: (id: string) =>
    api(`/profiles/saved-jobs/${id}`, { method: 'DELETE' }),
};

export const jobsApi = {
  search: (params: { q?: string; location?: string; remote?: boolean; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params.q) qs.set('q', params.q);
    if (params.location) qs.set('location', params.location);
    if (params.remote !== undefined) qs.set('remote', String(params.remote));
    if (params.limit) qs.set('limit', String(params.limit));
    return api<{ jobs: JobListing[]; sourcesQueried: string[]; cached: boolean }>(
      `/jobs/search?${qs}`
    );
  },
};

export const agentApi = {
  chat: (message: string, conversationId?: string) =>
    api<{ runId: string; conversationId: string; status: string }>('/agents/chat', {
      method: 'POST',
      body: JSON.stringify({ message, conversationId }),
    }),
  getRun: (id: string) => api<{ run: AgentRun }>(`/agents/runs/${id}`),
  listRuns: () => api<{ runs: AgentRun[] }>('/agents/runs'),
  applyPack: (job: JobListing) =>
    api<{
      pack: {
        jobId: string;
        coverLetter: string;
        resumeBullets: string[];
        checklist: string[];
        createdAt: string;
      };
    }>('/agents/apply-pack', {
      method: 'POST',
      body: JSON.stringify({ job }),
    }),
  getRadar: () =>
    api<{
      subscription: {
        enabled: boolean;
        query: string;
        remote: boolean;
        lastRunAt?: string;
        lastNotifiedAt?: string;
      };
    }>('/agents/radar'),
  updateRadar: (body: { enabled?: boolean; query?: string; remote?: boolean }) =>
    api('/agents/radar', { method: 'PUT', body: JSON.stringify(body) }),
  runRadar: () => api('/agents/radar/run', { method: 'POST' }),
};

export const notificationApi = {
  list: () =>
    api<{
      notifications: Array<{
        id: string;
        title: string;
        body: string;
        read: boolean;
        createdAt: string;
      }>;
    }>('/notifications'),
  markRead: (id: string) => api(`/notifications/${id}/read`, { method: 'POST' }),
};

export async function pollRun(
  runId: string,
  onUpdate?: (run: AgentRun) => void,
  timeoutMs = 90000
): Promise<AgentRun> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const { run } = await agentApi.getRun(runId);
    onUpdate?.(run);
    if (run.status === 'completed' || run.status === 'failed') return run;
    await new Promise((r) => setTimeout(r, 900));
  }
  throw new Error('Timed out waiting for agent');
}
