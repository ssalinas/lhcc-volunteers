import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useSession } from './client.js';

export function RequireAuth({ children }: { children: ReactNode }) {
  const { data, isPending } = useSession();
  const location = useLocation();

  if (isPending) return <FullPageLoading />;
  if (!data) return <Navigate to="/login" state={{ from: location }} replace />;

  return <>{children}</>;
}

export function RequireAdmin({ children }: { children: ReactNode }) {
  const { data, isPending } = useSession();
  const location = useLocation();

  if (isPending) return <FullPageLoading />;
  if (!data) return <Navigate to="/login" state={{ from: location }} replace />;
  const role = (data.user as { role?: string }).role;
  if (role !== 'admin') return <Navigate to="/" replace />;

  return <>{children}</>;
}

function FullPageLoading() {
  return <div style={{ padding: '2rem' }}>Loading…</div>;
}
