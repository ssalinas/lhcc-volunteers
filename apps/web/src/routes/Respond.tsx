import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import type { AvailabilityStatus } from '@lhcc/shared';
import { useRespondClearDate, useRespondPage, useRespondSetDate } from '../api/hooks.js';
import { useToast } from '../components/Toast.js';

function dateLabel(date: string) {
  return format(new Date(`${date}T12:00:00`), 'EEEE, MMMM d');
}

/**
 * Public landing page for the buttons in availability emails: /respond?t=<token>[&d=<dates>&s=<status>].
 * No sign-in — the token is the credential. The tapped email button arrives as d/s and is shown
 * as a one-tap "Yes, save it" confirmation rather than saved on load, because email security
 * scanners open every link in a message and would otherwise answer for people.
 */
export default function Respond() {
  const [params, setParams] = useSearchParams();
  const token = params.get('t');
  const pendingDates = (params.get('d') ?? '').split(',').filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
  const pendingStatusParam = params.get('s');
  const pendingStatus: AvailabilityStatus | null =
    pendingStatusParam === 'available' || pendingStatusParam === 'unavailable' ? pendingStatusParam : null;

  const { data, isLoading, error } = useRespondPage(token);
  const setDate = useRespondSetDate(token);
  const clearDate = useRespondClearDate(token);
  const toast = useToast();
  const [justConfirmed, setJustConfirmed] = useState(false);
  const [confirming, setConfirming] = useState(false);

  async function confirmPending() {
    if (!pendingStatus) return;
    setConfirming(true);
    try {
      for (const date of pendingDates) await setDate.mutateAsync({ date, status: pendingStatus });
      setJustConfirmed(true);
      setParams({ t: token ?? '' }, { replace: true });
    } catch {
      toast('Sorry, that didn’t save. Please try again.', { variant: 'error' });
    } finally {
      setConfirming(false);
    }
  }

  function answer(date: string, status: AvailabilityStatus, current: AvailabilityStatus | null) {
    const onError = () => toast('Sorry, that didn’t save. Please try again.', { variant: 'error' });
    if (current === status) {
      clearDate.mutate(date, { onSuccess: () => toast('Answer cleared'), onError });
    } else {
      setDate.mutate({ date, status }, { onSuccess: () => toast('Saved ✓ Thank you!'), onError });
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.column}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
          <img src="/logo.png" alt="" style={{ width: 52, height: 52, objectFit: 'contain' }} />
          <span style={{ fontWeight: 700, fontSize: '1.2rem' }}>LHCC Volunteers</span>
        </div>

        {!token || error ? (
          <div className="card" style={styles.bigCard}>
            <h1 style={{ marginTop: 0, fontSize: '1.5rem' }}>This link has expired</h1>
            <p style={styles.bigText}>
              Links in our emails only work for a few weeks. You can still answer by signing in, or by replying to the
              church office.
            </p>
            <Link to="/login" className="btn btn-primary" style={styles.bigButton}>
              Sign in
            </Link>
          </div>
        ) : isLoading || !data ? (
          <p style={styles.bigText}>Loading…</p>
        ) : (
          <>
            {pendingStatus && pendingDates.length > 0 && !justConfirmed && (
              <div className="card" style={{ ...styles.bigCard, border: '2px solid var(--color-primary)' }}>
                <h1 style={{ marginTop: 0, fontSize: '1.5rem' }}>Hi {data.firstName}, please confirm:</h1>
                <p style={{ ...styles.bigText, fontWeight: 700 }}>
                  {pendingStatus === 'available' ? '✓ I can serve on' : '✗ I can’t make it on'}
                </p>
                <ul style={{ ...styles.bigText, margin: '0 0 1.25rem', paddingLeft: '1.25rem' }}>
                  {pendingDates.map((d) => (
                    <li key={d}>{dateLabel(d)}</li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={confirmPending}
                  disabled={confirming}
                  className="btn btn-primary"
                  style={styles.bigButton}
                >
                  {confirming ? 'Saving…' : 'Yes, save my answer'}
                </button>
                <button
                  type="button"
                  onClick={() => setParams({ t: token }, { replace: true })}
                  className="btn btn-ghost"
                  style={{ ...styles.bigButton, marginTop: '0.5rem', background: 'transparent' }}
                >
                  No, let me choose below
                </button>
              </div>
            )}

            {justConfirmed && (
              <div className="card" style={{ ...styles.bigCard, background: 'var(--color-success-light)', boxShadow: 'none' }}>
                <h1 style={{ marginTop: 0, fontSize: '1.5rem', color: 'var(--color-success)' }}>Thank you, {data.firstName}!</h1>
                <p style={{ ...styles.bigText, margin: 0 }}>Your answer is saved. You can close this page, or answer any other dates below.</p>
              </div>
            )}

            {!(pendingStatus && pendingDates.length > 0 && !justConfirmed) && !justConfirmed && (
              <h1 style={{ fontSize: '1.5rem' }}>Hi {data.firstName} — can you serve?</h1>
            )}

            <p style={styles.bigText}>Tap your answer for each date. It saves right away.</p>

            {data.dates.length === 0 && <p style={styles.bigText}>There are no upcoming dates that need an answer from you.</p>}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {data.dates.map((d) => (
                <div key={d.date} className="card" style={{ padding: '1rem 1.1rem' }}>
                  <div style={{ fontWeight: 700, fontSize: '1.15rem' }}>{dateLabel(d.date)}</div>
                  <div style={{ color: 'var(--color-text-muted)', marginBottom: '0.6rem' }}>
                    {d.eventNames.join(', ')}
                    {d.status === null && (
                      <span className="badge badge-warning" style={{ marginLeft: '0.5rem' }}>
                        Not answered yet
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <AnswerButton
                      active={d.status === 'available'}
                      color="var(--color-success)"
                      onClick={() => answer(d.date, 'available', d.status)}
                    >
                      ✓ I can serve
                    </AnswerButton>
                    <AnswerButton
                      active={d.status === 'unavailable'}
                      color="var(--color-danger)"
                      onClick={() => answer(d.date, 'unavailable', d.status)}
                    >
                      ✗ Can’t make it
                    </AnswerButton>
                  </div>
                </div>
              ))}
            </div>

            <p style={{ ...styles.bigText, marginTop: '2rem', fontSize: '1rem', color: 'var(--color-text-muted)' }}>
              Want to see the full schedule?{' '}
              <Link to={`/login?email=${encodeURIComponent(data.email)}`}>Sign in here</Link> — we’ll email you a
              sign-in link, no password needed.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function AnswerButton({
  active,
  color,
  onClick,
  children,
}: {
  active: boolean;
  color: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={{
        flex: '1 1 140px',
        padding: '0.85rem 1rem',
        borderRadius: 'var(--radius-md)',
        border: `2px solid ${active ? color : 'var(--color-border)'}`,
        background: active ? color : 'var(--color-surface)',
        color: active ? '#fff' : 'var(--color-text)',
        fontFamily: 'inherit',
        fontSize: '1.05rem',
        fontWeight: 700,
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: '100vh', background: 'var(--color-bg)', padding: '1.5rem 1rem 3rem' },
  column: { maxWidth: 560, margin: '0 auto' },
  bigCard: { padding: '1.5rem', marginBottom: '1.5rem' },
  bigText: { fontSize: '1.1rem', lineHeight: 1.5 },
  bigButton: { width: '100%', fontSize: '1.1rem', padding: '0.9rem 1rem' },
};
