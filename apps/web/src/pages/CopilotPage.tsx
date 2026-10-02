import { useState, type FormEvent } from 'react';
import { JobCard } from '../components/JobCard';
import { agentApi, pollRun, profileApi, type AgentRun, type JobListing } from '../lib/api';

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  jobs?: JobListing[];
};

export function CopilotPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content:
        'Ask me for remote backend roles, React jobs, or anything that matches your profile. I search live job APIs and return apply links.',
    },
  ]);
  const [input, setInput] = useState('Find remote software engineer jobs I can apply to this week');
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [status, setStatus] = useState('');
  const [jobs, setJobs] = useState<JobListing[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [packingId, setPackingId] = useState<string | null>(null);
  const [packPreview, setPackPreview] = useState<{
    coverLetter: string;
    resumeBullets: string[];
    checklist: string[];
  } | null>(null);

  async function onSend(e: FormEvent) {
    e.preventDefault();
    if (!input.trim() || busy) return;
    const text = input.trim();
    setInput('');
    setError('');
    setBusy(true);
    setPackPreview(null);
    setMessages((m) => [...m, { id: crypto.randomUUID(), role: 'user', content: text }]);

    try {
      const { runId, conversationId: cid } = await agentApi.chat(text, conversationId);
      setConversationId(cid);
      setStatus('queued');

      const run = await pollRun(runId, (r: AgentRun) => setStatus(r.status));
      const reply = run.reply || (run.status === 'failed' ? run.error || 'Failed' : 'Done.');
      const runJobs = run.jobs || [];
      setJobs(runJobs);
      setMessages((m) => [
        ...m,
        {
          id: run.id,
          role: 'assistant',
          content:
            reply +
            (run.sourcesQueried?.length
              ? `\n\nSources: ${run.sourcesQueried.join(', ')}`
              : ''),
          jobs: runJobs,
        },
      ]);
      setStatus('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Agent failed');
      setStatus('');
    } finally {
      setBusy(false);
    }
  }

  async function saveJob(job: JobListing) {
    setSavingId(job.id);
    try {
      await profileApi.saveJob(job, job.fitScore, job.reasons);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSavingId(null);
    }
  }

  async function makePack(job: JobListing) {
    setPackingId(job.id);
    setPackPreview(null);
    try {
      const { pack } = await agentApi.applyPack(job);
      setPackPreview(pack);
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
          <h1>Copilot</h1>
          <p>Ask in plain language. Agents search live boards and return ranked roles with apply links.</p>
        </div>
        {status && (
          <div className="status-pill">
            <span className="spinner" />
            {status}
          </div>
        )}
      </div>

      <div className="chat-layout">
        <section className="chat-panel card-surface">
          <div className="messages">
            {messages.map((m) => (
              <div key={m.id} className={`bubble ${m.role}`}>
                {m.content.replace(/https?:\/\/\S+/g, '').replace(/[ \t]+\n/g, '\n').trim()}
              </div>
            ))}
          </div>
          {error && <p className="error">{error}</p>}
          <form className="composer" onSubmit={onSend}>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Find remote backend roles…"
              disabled={busy}
            />
            <button className="btn" type="submit" disabled={busy}>
              Send
            </button>
          </form>
        </section>

        <section className="results-panel">
          <div className="card-surface" style={{ marginBottom: '1rem' }}>
            <h2 style={{ marginTop: 0 }}>Matched jobs</h2>
            {jobs.length === 0 ? (
              <p className="empty">Matched roles from your latest run show up here as a ranked list.</p>
            ) : (
              <div className="job-grid">
                {jobs.map((job) => (
                  <JobCard
                    key={job.id}
                    job={job}
                    onSave={() => void saveJob(job)}
                    onApplyPack={() => void makePack(job)}
                    saving={savingId === job.id}
                    packing={packingId === job.id}
                  />
                ))}
              </div>
            )}
          </div>

          {packPreview && (
            <div className="card-surface">
              <h2 style={{ marginTop: 0 }}>Apply pack</h2>
              <h3>Cover letter</h3>
              <p style={{ whiteSpace: 'pre-wrap' }}>{packPreview.coverLetter}</p>
              <h3>Resume bullets</h3>
              <ul>
                {packPreview.resumeBullets.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
              <h3>Checklist</h3>
              <ul>
                {packPreview.checklist.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
