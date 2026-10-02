import { useEffect, useState, type FormEvent } from 'react';
import { agentApi, notificationApi } from '../lib/api';

export function RadarPage() {
  const [enabled, setEnabled] = useState(true);
  const [query, setQuery] = useState('');
  const [remote, setRemote] = useState(true);
  const [lastRunAt, setLastRunAt] = useState<string | undefined>();
  const [lastNotifiedAt, setLastNotifiedAt] = useState<string | undefined>();
  const [notifications, setNotifications] = useState<
    Array<{ id: string; title: string; body: string; read: boolean; createdAt: string }>
  >([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    const [radar, notes] = await Promise.all([agentApi.getRadar(), notificationApi.list()]);
    setEnabled(radar.subscription.enabled);
    setQuery(radar.subscription.query || '');
    setRemote(radar.subscription.remote !== false);
    setLastRunAt(radar.subscription.lastRunAt);
    setLastNotifiedAt(radar.subscription.lastNotifiedAt);
    setNotifications(notes.notifications);
  }

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : 'Load failed'));
  }, []);

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await agentApi.updateRadar({ enabled, query, remote });
      setMessage('Radar preferences saved.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  async function runNow() {
    setBusy(true);
    setError('');
    try {
      await agentApi.runRadar();
      setMessage('Radar sweep started. Check notifications below.');
      setTimeout(() => {
        void load();
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Radar run failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Radar</h1>
          <p>Daily scheduled sweeps for new jobs matching your profile (plus manual demo run).</p>
        </div>
      </div>

      <form className="card-surface" onSubmit={onSave} style={{ marginBottom: '1rem' }}>
        <label className="muted" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          Enable Radar
        </label>
        <div className="field" style={{ marginTop: '1rem' }}>
          <label htmlFor="query">Override search query (optional)</label>
          <input
            id="query"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Uses profile titles/skills if empty"
          />
        </div>
        <label className="muted" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <input type="checkbox" checked={remote} onChange={(e) => setRemote(e.target.checked)} />
          Prefer remote
        </label>
        <div className="actions" style={{ marginTop: '1rem' }}>
          <button className="btn" type="submit" disabled={busy}>
            Save
          </button>
          <button className="btn secondary" type="button" disabled={busy} onClick={() => void runNow()}>
            Run Radar now
          </button>
        </div>
        <p className="muted">
          Last run: {lastRunAt ? new Date(lastRunAt).toLocaleString() : 'never'} · Last notify:{' '}
          {lastNotifiedAt ? new Date(lastNotifiedAt).toLocaleString() : 'never'}
        </p>
        {message && <p className="success">{message}</p>}
        {error && <p className="error">{error}</p>}
      </form>

      <div className="card-surface">
        <h2 style={{ marginTop: 0 }}>In-app notifications</h2>
        {notifications.length === 0 ? (
          <p className="empty">No notifications yet.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {notifications.map((n) => (
              <article key={n.id}>
                <strong>{n.title}</strong>
                <div className="muted">{new Date(n.createdAt).toLocaleString()}</div>
                <p style={{ whiteSpace: 'pre-wrap' }}>{n.body}</p>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
