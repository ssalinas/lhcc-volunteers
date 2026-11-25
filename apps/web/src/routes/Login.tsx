import { useState, type FormEvent } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { signIn, useSession } from '../auth/client.js';
import { useLoginOptions } from '../api/hooks.js';

/**
 * Leads with "Email me a sign-in link" (no password) because many volunteers — often older, and
 * often without a Google account — can't manage a username/password unassisted. Google and
 * password sign-in are still here, just not first.
 */
export default function Login() {
  const { data } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const from = (location.state as { from?: Location })?.from?.pathname ?? '/';
  const { data: options } = useLoginOptions();
  const emailLinkEnabled = options?.emailLink ?? true;

  const [email, setEmail] = useState(params.get('email') ?? '');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(linkErrorMessage(params.get('error')));
  const [submitting, setSubmitting] = useState(false);
  const [linkSentTo, setLinkSentTo] = useState<string | null>(null);

  if (data) {
    navigate(from, { replace: true });
    return null;
  }

  async function handleEmailLink(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const { error: sendError } = await signIn.magicLink({ email: email.trim(), callbackURL: from });
    setSubmitting(false);
    if (sendError) {
      setError(sendError.message ?? 'Something went wrong. Please try again.');
      return;
    }
    setLinkSentTo(email.trim());
  }

  async function handlePassword(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const { error: signInError } = await signIn.email({ email: email.trim(), password });
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
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '1rem' }}>
          <img src="/logo.png" alt="Longwood Hills Congregational Church" style={styles.logo} />
          <h1 style={{ margin: '0.5rem 0 0', fontSize: '1.4rem', textAlign: 'center' }}>LHCC Volunteers</h1>
        </div>

        {linkSentTo ? (
          <div style={{ textAlign: 'center' }}>
            <h2 style={{ fontSize: '1.3rem', margin: '0 0 0.75rem' }}>Check your email</h2>
            <p style={styles.bigText}>
              If <strong>{linkSentTo}</strong> is registered with us, we just sent it a sign-in link. Open that email
              and tap <strong>“Sign me in”</strong>.
            </p>
            <p style={{ ...styles.help, textAlign: 'left' }}>
              • The link works for one hour.
              <br />• Don’t see it after a few minutes? Check your spam or junk folder.
              <br />• Still nothing? The church office may have a different email address for you — please let them
              know.
            </p>
            <button type="button" onClick={() => setLinkSentTo(null)} className="btn btn-secondary" style={{ width: '100%', marginTop: '0.5rem' }}>
              Try a different email
            </button>
          </div>
        ) : (
          <>
            <form
              onSubmit={showPassword || !emailLinkEnabled ? handlePassword : handleEmailLink}
              style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}
            >
              <label style={styles.label}>
                Your email address
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  style={{ width: '100%', fontSize: '1.05rem', padding: '0.7rem' }}
                />
              </label>

              {(showPassword || !emailLinkEnabled) && (
                <label style={styles.label}>
                  Password
                  <input
                    type="password"
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    style={{ width: '100%', fontSize: '1.05rem', padding: '0.7rem' }}
                  />
                </label>
              )}

              {error && <div style={styles.error}>{error}</div>}

              <button type="submit" disabled={submitting} className="btn btn-primary" style={styles.bigButton}>
                {submitting
                  ? 'Please wait…'
                  : showPassword || !emailLinkEnabled
                    ? 'Sign in'
                    : 'Email me a sign-in link'}
              </button>
              {emailLinkEnabled && !showPassword && (
                <p style={{ ...styles.help, margin: 0, textAlign: 'center' }}>No password needed — we’ll email you a button to tap.</p>
              )}
            </form>

            {emailLinkEnabled && (
              <button
                type="button"
                onClick={() => {
                  setShowPassword((v) => !v);
                  setError(null);
                }}
                className="btn btn-ghost"
                style={{ width: '100%', marginTop: '0.5rem' }}
              >
                {showPassword ? 'Email me a sign-in link instead' : 'I have a password'}
              </button>
            )}

            {options?.google && (
              <>
                <div style={styles.divider}>or</div>
                <button type="button" onClick={handleGoogle} className="btn btn-secondary" style={{ width: '100%' }}>
                  Sign in with Google
                </button>
                <p style={styles.approvalNote}>First-time Google sign-ins need admin approval before you can use the app.</p>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** better-auth redirects back here with ?error=... when a sign-in link is expired/used/invalid. */
function linkErrorMessage(code: string | null) {
  if (!code) return null;
  if (/expired|invalid|token/i.test(code)) {
    return 'That sign-in link has expired or was already used. Enter your email below and we’ll send a new one.';
  }
  return 'Sign-in didn’t work. Please try again.';
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
  card: { width: 400, maxWidth: '100%', padding: '2.25rem 2rem' },
  logo: { width: 88, height: 88, objectFit: 'contain' },
  divider: { textAlign: 'center', color: 'var(--color-text-faint)', margin: '1.1rem 0', fontSize: '0.85rem' },
  approvalNote: { textAlign: 'center', color: 'var(--color-text-faint)', fontSize: '0.78rem', margin: '0.6rem 0 0' },
  label: { display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.95rem', color: 'var(--color-text)', fontWeight: 600 },
  bigText: { fontSize: '1.05rem', lineHeight: 1.5 },
  bigButton: { width: '100%', fontSize: '1.1rem', padding: '0.9rem 1rem' },
  help: { fontSize: '0.9rem', color: 'var(--color-text-muted)', lineHeight: 1.6 },
  error: { color: 'var(--color-danger)', fontSize: '0.95rem', fontWeight: 600 },
};
