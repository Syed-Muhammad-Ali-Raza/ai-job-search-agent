import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';

export function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
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
      await login(email, password);
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
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
            Tell the agent what you want. It searches live job boards, scores fit to your profile,
            and hands you the real apply links.
          </p>
        </div>
        <p className="foot">Profiler · Scout · Matcher · Packager</p>
      </section>
      <div className="auth-form-wrap">
        <form className="auth-card" onSubmit={onSubmit}>
          <h1>Welcome back</h1>
          <p className="subtitle">Sign in to continue scouting roles.</p>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>
          {error && <p className="error">{error}</p>}
          <button className="btn" type="submit" disabled={loading} style={{ width: '100%' }}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
          <p className="muted" style={{ marginTop: '1.15rem', textAlign: 'center' }}>
            New here?{' '}
            <Link className="link-quiet" to="/register">
              Create an account
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
