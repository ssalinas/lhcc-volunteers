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
      <div style={styles.card}>
        <h1 style={{ marginTop: 0 }}>LHCC Volunteers</h1>
        <button type="button" onClick={handleGoogle} style={styles.googleButton}>
          Sign in with Google
        </button>

        <div style={styles.divider}>or</div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <label style={styles.label}>
            Email
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={styles.input}
            />
          </label>
          <label style={styles.label}>
            Password
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={styles.input}
            />
          </label>
          {error && <div style={styles.error}>{error}</div>}
          <button type="submit" disabled={submitting} style={styles.submitButton}>
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
    background: '#fafafa',
  },
  card: {
    width: 360,
    padding: '2rem',
    background: '#fff',
    borderRadius: 12,
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
  },
  googleButton: {
    width: '100%',
    padding: '0.6rem',
    borderRadius: 8,
    border: '1px solid #ccc',
    background: '#fff',
    cursor: 'pointer',
    fontSize: '0.95rem',
  },
  divider: {
    textAlign: 'center',
    color: '#888',
    margin: '1rem 0',
    fontSize: '0.85rem',
  },
  label: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
    fontSize: '0.85rem',
    color: '#333',
  },
  input: {
    padding: '0.5rem',
    borderRadius: 6,
    border: '1px solid #ccc',
    fontSize: '1rem',
  },
  error: {
    color: '#b00020',
    fontSize: '0.85rem',
  },
  submitButton: {
    padding: '0.6rem',
    borderRadius: 8,
    border: 'none',
    background: '#2f6f4f',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '0.95rem',
  },
};
