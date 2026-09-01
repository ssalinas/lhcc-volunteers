import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { signOut, useSession } from './client.js';

export function RequireAuth({ children }: { children: ReactNode }) {
  const { data, isPending } = useSession();
  const location = useLocation();

  if (isPending) return <FullPageLoading />;
  if (!data) return <Navigate to="/login" state={{ from: location }} replace />;
  if ((data.user as { active?: boolean }).active === false) return <PendingApproval />;

  return <>{children}</>;
}

export function RequireAdmin({ children }: { children: ReactNode }) {
  const { data, isPending } = useSession();
  const location = useLocation();

  if (isPending) return <FullPageLoading />;
  if (!data) return <Navigate to="/login" state={{ from: location }} replace />;
  if ((data.user as { active?: boolean }).active === false) return <PendingApproval />;
  const role = (data.user as { role?: string }).role;
  if (role !== 'admin') return <Navigate to="/" replace />;

  return <>{children}</>;
}

function FullPageLoading() {
  return <div style={{ padding: '2rem' }}>Loading…</div>;
}

function PendingApproval() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem',
      }}
    >
      <div className="card" style={{ maxWidth: 380, textAlign: 'center', padding: '2rem' }}>
        <h1 style={{ fontSize: '1.15rem', marginBottom: '0.5rem' }}>Account pending approval</h1>
        <p style={{ color: 'var(--color-text-muted)', marginBottom: '1.25rem' }}>
          You're signed in, but an admin needs to approve your account before you can use the app. Check back
          later, or reach out to an admin directly.
        </p>
        <button type="button" onClick={() => signOut()} className="btn btn-secondary">
          Sign out
        </button>
      </div>
    </div>
  );
}
