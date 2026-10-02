import { useEffect, useState } from 'react';
import { agentApi, type AgentRun } from '../lib/api';

export function HistoryPage() {
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    agentApi
      .listRuns()
      .then((data) => setRuns(data.runs))
      .catch((err) => setError(err instanceof Error ? err.message : 'Load failed'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Run history</h1>
          <p>Transparency into agent runs, statuses, and sources queried.</p>
        </div>
      </div>

      {loading && <p className="muted">Loading…</p>}
      {error && <p className="error">{error}</p>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {runs.map((run) => (
          <article key={run.id} className="card-surface">
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
              <strong>{run.status}</strong>
              <span className="muted">{new Date(run.createdAt).toLocaleString()}</span>
            </div>
            <p style={{ marginBottom: 0 }}>{run.message}</p>
            {run.reply && (
              <p className="muted" style={{ whiteSpace: 'pre-wrap' }}>
                {run.reply.slice(0, 400)}
                {run.reply.length > 400 ? '…' : ''}
              </p>
            )}
            <div className="chip-row">
              {(run.sourcesQueried || []).map((s) => (
                <span className="chip" key={s}>
                  {s}
                </span>
              ))}
              <span className="chip">{(run.jobs || []).length} jobs</span>
            </div>
          </article>
        ))}
      </div>
      {!loading && runs.length === 0 && <p className="empty">No agent runs yet.</p>}
    </div>
  );
}
