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
        <div style={styles.brand}>
          <img src="/logo.png" alt="" style={styles.logo} />
          <span>LHCC Volunteers</span>
        </div>
        <nav style={styles.nav}>
          <NavItem to="/">Calendar</NavItem>
          <NavItem to="/availability">Availability</NavItem>
          <NavItem to="/teams">Teams</NavItem>
          {isAdmin && (
            <>
              <span style={styles.navSep} />
              <NavItem to="/admin/events">Events</NavItem>
              <NavItem to="/admin/schedule">Batch Schedule</NavItem>
              <NavItem to="/admin/teams">Manage Teams</NavItem>
              <NavItem to="/admin/users">Users</NavItem>
              <NavItem to="/admin/reports">Reports</NavItem>
            </>
          )}
        </nav>
        <div style={styles.userArea}>
          {data?.user && <span style={styles.userName}>{data.user.name}</span>}
          <button type="button" onClick={handleSignOut} className="btn btn-secondary btn-sm">
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
    padding: '0.6rem 1.75rem',
    background: '#fff',
    borderBottom: '1px solid var(--color-border)',
    boxShadow: '0 1px 3px rgba(16,24,40,0.04)',
    flexWrap: 'wrap',
    position: 'sticky',
    top: 0,
    zIndex: 10,
  },
  brand: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.6rem',
    fontWeight: 700,
    fontSize: '1.05rem',
    color: 'var(--color-text)',
    whiteSpace: 'nowrap',
  },
  logo: { height: 40, width: 40, objectFit: 'contain' },
  nav: { display: 'flex', gap: '0.3rem', flex: 1, flexWrap: 'wrap', alignItems: 'center' },
  navSep: { width: 1, height: 20, background: 'var(--color-border)', margin: '0 0.4rem' },
  navLink: {
    color: 'var(--color-text-muted)',
    textDecoration: 'none',
    fontSize: '0.88rem',
    fontWeight: 600,
    padding: '0.4rem 0.7rem',
    borderRadius: 999,
  },
  navLinkActive: { background: 'var(--color-primary-light)', color: 'var(--color-primary)' },
  userArea: { display: 'flex', alignItems: 'center', gap: '0.75rem' },
  userName: { fontSize: '0.85rem', color: 'var(--color-text-muted)' },
  main: { flex: 1, padding: '1.75rem', maxWidth: 1100, width: '100%', margin: '0 auto' },
};
