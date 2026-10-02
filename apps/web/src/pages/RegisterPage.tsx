import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';

export function RegisterPage() {
  const { user, register } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (user) return <Navigate to="/" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await register(name, email, password);
      navigate('/profile');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <section className="auth-hero">
        <div>
          <div className="mark">Career Copilot</div>
          <p className="lede">
            One profile. Live listings from job APIs. Apply packs ready before you click out.
          </p>
        </div>
        <p className="foot">Built for engineers hunting their next role</p>
      </section>
      <div className="auth-form-wrap">
        <form className="auth-card" onSubmit={onSubmit}>
          <h1>Create account</h1>
          <p className="subtitle">Start with a profile, then let the agents search.</p>
          <div className="field">
            <label htmlFor="name">Name</label>
            <input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="password">Password (min 8)</label>
            <input
              id="password"
              type="password"
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error && <p className="error">{error}</p>}
          <button className="btn" type="submit" disabled={loading} style={{ width: '100%' }}>
            {loading ? 'Creating…' : 'Create account'}
          </button>
          <p className="muted" style={{ marginTop: '1.15rem', textAlign: 'center' }}>
            Already have an account?{' '}
            <Link className="link-quiet" to="/login">
              Sign in
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
