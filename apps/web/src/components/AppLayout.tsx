import type { ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { signOut, useSession } from '../auth/client.js';

export default function AppLayout({ children }: { children: ReactNode }) {
  const { data } = useSession();
  const navigate = useNavigate();
  const role = (data?.user as { role?: string } | undefined)?.role;
  const isAdmin = role === 'admin';

  async function handleSignOut() {
    await signOut();
    navigate('/login');
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header style={styles.header}>
        <div style={styles.brand}>LHCC Volunteers</div>
        <nav style={styles.nav}>
          <NavItem to="/">Calendar</NavItem>
          <NavItem to="/availability">Availability</NavItem>
          <NavItem to="/teams">Teams</NavItem>
          {isAdmin && (
            <>
              <span style={styles.navSep}>|</span>
              <NavItem to="/admin/events">Events</NavItem>
              <NavItem to="/admin/teams">Manage Teams</NavItem>
              <NavItem to="/admin/users">Users</NavItem>
              <NavItem to="/admin/reports">Reports</NavItem>
            </>
          )}
        </nav>
        <div style={styles.userArea}>
          {data?.user && <span style={styles.userName}>{data.user.name}</span>}
          <button type="button" onClick={handleSignOut} style={styles.signOutButton}>
            Sign out
          </button>
        </div>
      </header>
      <main style={styles.main}>{children}</main>
    </div>
  );
}

function NavItem({ to, children }: { to: string; children: ReactNode }) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      style={({ isActive }) => ({
        ...styles.navLink,
        ...(isActive ? styles.navLinkActive : {}),
      })}
    >
      {children}
    </NavLink>
  );
}

const styles: Record<string, React.CSSProperties> = {
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '1.5rem',
    padding: '0.75rem 1.5rem',
    background: '#2f6f4f',
    color: '#fff',
    flexWrap: 'wrap',
  },
  brand: { fontWeight: 700, fontSize: '1.1rem' },
  nav: { display: 'flex', gap: '0.75rem', flex: 1, flexWrap: 'wrap', alignItems: 'center' },
  navSep: { opacity: 0.5 },
  navLink: {
    color: '#e6f0ea',
    textDecoration: 'none',
    fontSize: '0.9rem',
    padding: '0.25rem 0.5rem',
    borderRadius: 6,
  },
  navLinkActive: { background: 'rgba(255,255,255,0.15)', color: '#fff' },
  userArea: { display: 'flex', alignItems: 'center', gap: '0.75rem' },
  userName: { fontSize: '0.85rem', opacity: 0.9 },
  signOutButton: {
    padding: '0.35rem 0.75rem',
    borderRadius: 6,
    border: '1px solid rgba(255,255,255,0.4)',
    background: 'transparent',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '0.85rem',
  },
  main: { flex: 1, padding: '1.5rem', maxWidth: 1100, width: '100%', margin: '0 auto' },
};
