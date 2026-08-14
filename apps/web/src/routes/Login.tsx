import { useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { signIn, useSession } from '../auth/client.js';

export default function Login() {
  const { data } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: Location })?.from?.pathname ?? '/';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (data) {
    navigate(from, { replace: true });
    return null;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const { error: signInError } = await signIn.email({ email, password });
    setSubmitting(false);
    if (signInError) {
      setError(signInError.message ?? 'Sign in failed');
      return;
    }
    navigate(from, { replace: true });
  }

  async function handleGoogle() {
    await signIn.social({ provider: 'google', callbackURL: from });
  }

  return (
    <div style={styles.page}>
      <div className="card" style={styles.card}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '0.5rem' }}>
          <img src="/logo.png" alt="Longwood Hills Congregational Church" style={styles.logo} />
          <h1 style={{ margin: '0.5rem 0 0', fontSize: '1.3rem', textAlign: 'center' }}>LHCC Volunteers</h1>
        </div>

        <button type="button" onClick={handleGoogle} className="btn btn-secondary" style={{ width: '100%' }}>
          Sign in with Google
        </button>

        <div style={styles.divider}>or</div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          <label style={styles.label}>
            Email
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{ width: '100%' }}
            />
          </label>
          <label style={styles.label}>
            Password
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{ width: '100%' }}
            />
          </label>
          {error && <div style={styles.error}>{error}</div>}
          <button type="submit" disabled={submitting} className="btn btn-primary" style={{ width: '100%' }}>
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'radial-gradient(circle at top, var(--color-primary-lighter) 0%, var(--color-bg) 65%)',
    padding: '1.5rem',
  },
  card: {
    width: 360,
    maxWidth: '100%',
    padding: '2.25rem 2rem',
  },
  logo: { width: 88, height: 88, objectFit: 'contain' },
  divider: {
    textAlign: 'center',
    color: 'var(--color-text-faint)',
    margin: '1.1rem 0',
    fontSize: '0.8rem',
  },
  label: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.3rem',
    fontSize: '0.85rem',
    color: 'var(--color-text-muted)',
    fontWeight: 500,
  },
  error: {
    color: 'var(--color-danger)',
    fontSize: '0.85rem',
  },
};
