import { useSearchParams } from 'react-router-dom';

/**
 * Landing page for the button in "Your sign-in link" emails: /signin-link?token=...[&cb=/path].
 * better-auth's verify URL uses the token up on the first visit, and email security scanners
 * open every link in a message — so the email points here, and we only visit the verify URL when
 * the person taps the button.
 */
export default function SignInLink() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const cb = params.get('cb');
  const target = cb && cb.startsWith('/') && !cb.startsWith('//') ? cb : '/';

  function signIn() {
    const origin = window.location.origin;
    const verify = new URLSearchParams({
      token: token ?? '',
      callbackURL: `${origin}${target}`,
      errorCallbackURL: `${origin}/login`,
    });
    window.location.href = `/api/auth/magic-link/verify?${verify.toString()}`;
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem', background: 'var(--color-bg)' }}>
      <div className="card" style={{ width: 420, maxWidth: '100%', padding: '2rem', textAlign: 'center' }}>
        <img src="/logo.png" alt="" style={{ width: 80, height: 80, objectFit: 'contain' }} />
        <h1 style={{ fontSize: '1.5rem', margin: '0.75rem 0' }}>LHCC Volunteers</h1>
        {token ? (
          <>
            <p style={{ fontSize: '1.1rem' }}>Tap the button to finish signing in.</p>
            <button type="button" onClick={signIn} className="btn btn-primary" style={{ width: '100%', fontSize: '1.15rem', padding: '0.95rem' }}>
              Sign me in
            </button>
          </>
        ) : (
          <p style={{ fontSize: '1.1rem' }}>
            This sign-in link is incomplete. <a href="/login">Go to the sign-in page</a> to get a new one.
          </p>
        )}
      </div>
    </div>
  );
}
