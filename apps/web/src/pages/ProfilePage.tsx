import { useEffect, useState, type FormEvent } from 'react';
import { profileApi, type Profile } from '../lib/api';

const empty: Profile = {
  userId: '',
  headline: '',
  summary: '',
  skills: [],
  experience: [],
  locations: [],
  remotePreference: 'any',
  seniority: '',
  targetTitles: [],
  visaPrefs: '',
};

export function ProfilePage() {
  const [profile, setProfile] = useState<Profile>(empty);
  const [skillsText, setSkillsText] = useState('');
  const [titlesText, setTitlesText] = useState('');
  const [locationsText, setLocationsText] = useState('');
  const [resumeText, setResumeText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profiling, setProfiling] = useState(false);

  useEffect(() => {
    profileApi
      .get()
      .then(({ profile: p }) => {
        setProfile(p);
        setSkillsText((p.skills || []).join(', '));
        setTitlesText((p.targetTitles || []).join(', '));
        setLocationsText((p.locations || []).join(', '));
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Load failed'))
      .finally(() => setLoading(false));
  }, []);

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const { profile: p } = await profileApi.update({
        ...profile,
        skills: skillsText
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        targetTitles: titlesText
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        locations: locationsText
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      });
      setProfile(p);
      setMessage('Profile saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function onProfiler(e: FormEvent) {
    e.preventDefault();
    setProfiling(true);
    setError('');
    setMessage('');
    try {
      let profileRes: { profile: Profile; meta?: { method: string } };
      if (file) {
        const form = new FormData();
        form.append('resume', file);
        profileRes = await profileApi.fromResume(form);
      } else if (resumeText.trim()) {
        profileRes = await profileApi.fromResumeText(resumeText);
      } else {
        throw new Error('Upload a PDF/TXT or paste resume text');
      }
      const { profile: p, meta } = profileRes;
      setProfile(p);
      setSkillsText((p.skills || []).join(', '));
      setTitlesText((p.targetTitles || []).join(', '));
      setLocationsText((p.locations || []).join(', '));
      setMessage(`Profiler completed via ${meta?.method || 'llm'}. Review and save if needed.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Profiler failed');
    } finally {
      setProfiling(false);
    }
  }

  if (loading) return <p className="muted">Loading profile…</p>;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Profile</h1>
          <p>Upload a resume for the Profiler agent, or edit skills manually.</p>
        </div>
      </div>

      <div className="grid-2">
        <form className="card-surface" onSubmit={onProfiler}>
          <h2 style={{ marginTop: 0 }}>Profiler agent</h2>
          <div className="field">
            <label htmlFor="resume">Resume PDF or TXT</label>
            <input
              id="resume"
              type="file"
              accept=".pdf,.txt,.md"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
          </div>
          <div className="field">
            <label htmlFor="resumeText">Or paste text</label>
            <textarea
              id="resumeText"
              rows={8}
              value={resumeText}
              onChange={(e) => setResumeText(e.target.value)}
              placeholder="Paste resume content…"
            />
          </div>
          <button className="btn" type="submit" disabled={profiling}>
            {profiling ? 'Extracting…' : 'Run Profiler'}
          </button>
        </form>

        <form className="card-surface" onSubmit={onSave}>
          <h2 style={{ marginTop: 0 }}>Career profile</h2>
          <div className="field">
            <label htmlFor="headline">Headline</label>
            <input
              id="headline"
              value={profile.headline}
              onChange={(e) => setProfile({ ...profile, headline: e.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="summary">Summary</label>
            <textarea
              id="summary"
              rows={4}
              value={profile.summary}
              onChange={(e) => setProfile({ ...profile, summary: e.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="skills">Skills (comma separated)</label>
            <input id="skills" value={skillsText} onChange={(e) => setSkillsText(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="titles">Target titles</label>
            <input id="titles" value={titlesText} onChange={(e) => setTitlesText(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="locations">Locations</label>
            <input
              id="locations"
              value={locationsText}
              onChange={(e) => setLocationsText(e.target.value)}
            />
          </div>
          <div className="grid-2">
            <div className="field">
              <label htmlFor="seniority">Seniority</label>
              <input
                id="seniority"
                value={profile.seniority}
                onChange={(e) => setProfile({ ...profile, seniority: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="remote">Remote preference</label>
              <select
                id="remote"
                value={profile.remotePreference}
                onChange={(e) =>
                  setProfile({
                    ...profile,
                    remotePreference: e.target.value as Profile['remotePreference'],
                  })
                }
              >
                <option value="any">Any</option>
                <option value="remote">Remote</option>
                <option value="hybrid">Hybrid</option>
                <option value="onsite">Onsite</option>
              </select>
            </div>
          </div>
          <button className="btn" type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Save profile'}
          </button>
        </form>
      </div>

      {message && <p className="success">{message}</p>}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
