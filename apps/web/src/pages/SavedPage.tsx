import { useEffect, useState } from 'react';
import { JobCard } from '../components/JobCard';
import { agentApi, profileApi, type JobListing } from '../lib/api';

type SavedItem = {
  id: string;
  job: JobListing;
  fitScore?: number;
  reasons?: string[];
};

export function SavedPage() {
  const [items, setItems] = useState<SavedItem[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [packingId, setPackingId] = useState<string | null>(null);
  const [pack, setPack] = useState<{
    coverLetter: string;
    resumeBullets: string[];
    checklist: string[];
  } | null>(null);

  async function load() {
    setLoading(true);
    try {
      const data = await profileApi.savedJobs();
      setItems(data.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Load failed');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function remove(id: string) {
    await profileApi.unsaveJob(id);
    setItems((prev) => prev.filter((i) => i.id !== id));
  }

  async function makePack(job: JobListing) {
    setPackingId(job.id);
    try {
      const { pack: p } = await agentApi.applyPack(job);
      setPack(p);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Apply pack failed');
    } finally {
      setPackingId(null);
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Saved jobs</h1>
          <p>Generate apply packs, then open the original apply link when ready.</p>
        </div>
      </div>

      {loading && <p className="muted">Loading…</p>}
      {error && <p className="error">{error}</p>}

      <div className="job-grid">
        {items.map((item) => (
          <div key={item.id}>
            <JobCard
              job={{
                ...item.job,
                fitScore: item.fitScore,
                reasons: item.reasons,
              }}
              onApplyPack={() => void makePack(item.job)}
              packing={packingId === item.job.id}
            />
            <button
              type="button"
              className="btn danger"
              style={{ marginTop: '0.5rem' }}
              onClick={() => void remove(item.id)}
            >
              Remove
            </button>
          </div>
        ))}
      </div>

      {!loading && items.length === 0 && <p className="empty">No saved jobs yet.</p>}

      {pack && (
        <div className="card-surface" style={{ marginTop: '1.5rem' }}>
          <h2 style={{ marginTop: 0 }}>Apply pack</h2>
          <h3>Cover letter</h3>
          <p style={{ whiteSpace: 'pre-wrap' }}>{pack.coverLetter}</p>
          <h3>Resume bullets</h3>
          <ul>
            {pack.resumeBullets.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
          <h3>Checklist</h3>
          <ul>
            {pack.checklist.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
