import { NavLink, Outlet, Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';

export function AppLayout() {
  const { user, logout } = useAuth();

  return (
    <div className="app-shell">
      <header className="topbar">
        <Link to="/" className="brand">
          <strong>Career Copilot</strong>
          <span>Job agents</span>
        </Link>
        <nav className="nav">
          <NavLink to="/" end>
            Copilot
          </NavLink>
          <NavLink to="/jobs">Search</NavLink>
          <NavLink to="/saved">Saved</NavLink>
          <NavLink to="/profile">Profile</NavLink>
          <NavLink to="/history">Runs</NavLink>
          <NavLink to="/radar">Radar</NavLink>
        </nav>
        <div className="topbar-user">
          <div className="who">
            <b>{user?.name}</b>
            {user?.email}
          </div>
          <button type="button" className="btn secondary" onClick={() => void logout()}>
            Log out
          </button>
        </div>
      </header>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
