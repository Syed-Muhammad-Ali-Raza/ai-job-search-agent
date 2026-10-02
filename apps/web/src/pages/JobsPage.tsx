import { useState, type FormEvent } from 'react';
import { JobCard } from '../components/JobCard';
import { jobsApi, profileApi, type JobListing } from '../lib/api';

export function JobsPage() {
  const [q, setQ] = useState('software engineer');
  const [location, setLocation] = useState('');
  const [remote, setRemote] = useState(true);
  const [jobs, setJobs] = useState<JobListing[]>([]);
  const [meta, setMeta] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);

  async function onSearch(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const data = await jobsApi.search({ q, location, remote, limit: 24 });
      setJobs(data.jobs);
      setMeta(
        `${data.jobs.length} jobs · sources: ${(data.sourcesQueried || []).join(', ') || 'none'}${
          data.cached ? ' · cached' : ''
        }`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setLoading(false);
    }
  }

  async function saveJob(job: JobListing) {
    setSavingId(job.id);
    try {
      await profileApi.saveJob(job);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Search jobs</h1>
          <p>Live listings from Remotive (and Adzuna if configured) with original apply links.</p>
        </div>
      </div>

      <form className="card-surface" onSubmit={onSearch} style={{ marginBottom: '1rem' }}>
        <div className="grid-2">
          <div className="field">
            <label htmlFor="q">Keywords</label>
            <input id="q" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="location">Location</label>
            <input
              id="location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="optional"
            />
          </div>
        </div>
        <label className="muted" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <input type="checkbox" checked={remote} onChange={(e) => setRemote(e.target.checked)} />
          Prefer remote
        </label>
        <div style={{ marginTop: '1rem' }}>
          <button className="btn" type="submit" disabled={loading}>
            {loading ? 'Searching…' : 'Search'}
          </button>
        </div>
        {meta && <p className="muted">{meta}</p>}
        {error && <p className="error">{error}</p>}
      </form>

      <div className="job-grid">
        {jobs.map((job) => (
          <JobCard
            key={job.id}
            job={job}
            onSave={() => void saveJob(job)}
            saving={savingId === job.id}
          />
        ))}
      </div>
      {!loading && jobs.length === 0 && <p className="empty">Run a search to see listings.</p>}
    </div>
  );
}
