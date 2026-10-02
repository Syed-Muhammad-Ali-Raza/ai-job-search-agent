import type { JobListing } from '../lib/api';

type Props = {
  job: JobListing;
  onSave?: () => void;
  onApplyPack?: () => void;
  saving?: boolean;
  packing?: boolean;
};

export function JobCard({ job, onSave, onApplyPack, saving, packing }: Props) {
  return (
    <article className="job-card">
      <div className="job-top">
        <div className="job-main">
          <h3>{job.title}</h3>
          <div className="meta">
            {job.company}
            {job.location ? ` · ${job.location}` : ''}
            {job.remote ? ' · Remote' : ''}
          </div>
        </div>
        {typeof job.fitScore === 'number' && (
          <div className="score">
            <small>Fit</small>
            {job.fitScore}
          </div>
        )}
      </div>
      {job.reasons && job.reasons.length > 0 && (
        <ul className="reasons">
          {job.reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}
      <div className="chip-row">
        <span className="chip">{job.source}</span>
        {(job.tags || []).slice(0, 4).map((t) => (
          <span className="chip" key={t}>
            {t}
          </span>
        ))}
      </div>
      <div className="actions">
        <a className="btn" href={job.applyUrl} target="_blank" rel="noreferrer">
          Apply
        </a>
        {onSave && (
          <button type="button" className="btn secondary" onClick={onSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        )}
        {onApplyPack && (
          <button type="button" className="btn ghost" onClick={onApplyPack} disabled={packing}>
            {packing ? '…' : 'Pack'}
          </button>
        )}
      </div>
    </article>
  );
}
