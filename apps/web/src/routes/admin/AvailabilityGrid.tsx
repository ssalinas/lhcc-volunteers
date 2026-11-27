import { useMemo, useState } from 'react';
import { addWeeks, format } from 'date-fns';
import type { AvailabilityStatus } from '@lhcc/shared';
import { useAvailabilityGrid, useClearAvailabilityForDate, useSetAvailabilityForDate } from '../../api/hooks.js';
import { useToast } from '../../components/Toast.js';

const WEEKS_SHOWN = 8;

/**
 * "Who hasn't answered?" — every active volunteer × every upcoming date, one click per cell to
 * record an answer. Exists for the volunteers who reply to the email or phone the office instead
 * of using the buttons: an admin can enter a whole reply in a few clicks instead of opening each
 * person's availability on the Users page.
 */
export default function AdminAvailabilityGrid() {
  const now = useMemo(() => new Date(), []);
  const to = useMemo(() => addWeeks(now, WEEKS_SHOWN), [now]);
  const { data, isLoading } = useAvailabilityGrid(now.toISOString(), to.toISOString());
  const [onlyMissing, setOnlyMissing] = useState(true);

  const rows = useMemo(() => {
    const users = data?.users ?? [];
    return onlyMissing ? users.filter((u) => Object.values(u.statuses).some((s) => s === null)) : users;
  }, [data, onlyMissing]);

  const missingCount = (data?.users ?? []).filter((u) => Object.values(u.statuses).some((s) => s === null)).length;

  return (
    <div>
      <h1 style={{ marginBottom: '0.25rem' }}>Who's Answered?</h1>
      <p style={{ color: 'var(--color-text-muted)', marginTop: 0 }}>
        Availability for the next {WEEKS_SHOWN} weeks. Click a box to record someone's answer (for example, from an
        email reply or phone call) — it saves right away. Each click cycles: <Cell status={null} /> not answered →{' '}
        <Cell status="available" /> available → <Cell status="unavailable" /> can't make it.
      </p>

      <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', margin: '0.5rem 0 1rem', fontWeight: 600 }}>
        <input type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} />
        Only show people with unanswered dates ({missingCount})
      </label>

      {isLoading || !data ? (
        <p>Loading…</p>
      ) : data.dates.length === 0 ? (
        <p>No upcoming dates in the next {WEEKS_SHOWN} weeks.</p>
      ) : rows.length === 0 ? (
        <p style={{ fontWeight: 600, color: 'var(--color-success)' }}>✓ Everyone has answered every date.</p>
      ) : (
        <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr style={{ background: 'var(--color-bg)' }}>
                <th style={{ ...thStyle, textAlign: 'left', position: 'sticky', left: 0, background: 'var(--color-bg)', zIndex: 1 }}>
                  Volunteer
                </th>
                {data.dates.map((d) => (
                  <th key={d.date} style={thStyle} title={d.eventNames.join(', ')}>
                    <div>{format(new Date(`${d.date}T12:00:00`), 'EEE')}</div>
                    <div style={{ whiteSpace: 'nowrap' }}>{format(new Date(`${d.date}T12:00:00`), 'MMM d')}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => (
                <tr key={u.userId} style={{ borderTop: '1px solid var(--color-border)' }}>
                  <td
                    style={{
                      padding: '0.5rem 0.9rem',
                      fontWeight: 600,
                      whiteSpace: 'nowrap',
                      position: 'sticky',
                      left: 0,
                      background: 'var(--color-surface)',
                    }}
                  >
                    {u.name}
                  </td>
                  {data.dates.map((d) => (
                    <td key={d.date} style={{ textAlign: 'center', padding: '0.35rem' }}>
                      {d.date in u.statuses ? (
                        <EditableCell userId={u.userId} name={u.name} date={d.date} status={u.statuses[d.date] ?? null} />
                      ) : (
                        <span title="Not needed — none of their teams serve this date" style={{ color: 'var(--color-text-faint)' }}>
                          –
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const thStyle: React.CSSProperties = { padding: '0.6rem 0.5rem', fontSize: '0.8rem', fontWeight: 700 };

const NEXT: Record<'null' | AvailabilityStatus, AvailabilityStatus | null> = {
  null: 'available',
  available: 'unavailable',
  unavailable: null,
};

function EditableCell({ userId, name, date, status }: { userId: string; name: string; date: string; status: AvailabilityStatus | null }) {
  const setForDate = useSetAvailabilityForDate(userId);
  const clearForDate = useClearAvailabilityForDate(userId);
  const toast = useToast();
  const pending = setForDate.isPending || clearForDate.isPending;

  function cycle() {
    const next = NEXT[status ?? 'null'];
    const onError = () => toast(`Couldn't save ${name}'s answer`, { variant: 'error' });
    if (next === null) clearForDate.mutate(date, { onError });
    else setForDate.mutate({ date, status: next }, { onError });
  }

  return (
    <button
      type="button"
      onClick={cycle}
      disabled={pending}
      aria-label={`${name}, ${date}: ${status ?? 'not answered'}. Click to change.`}
      style={{ border: 'none', background: 'transparent', padding: 0, cursor: 'pointer', opacity: pending ? 0.5 : 1 }}
    >
      <Cell status={status} />
    </button>
  );
}

function Cell({ status }: { status: AvailabilityStatus | null }) {
  const look =
    status === 'available'
      ? { bg: 'var(--color-success)', fg: '#fff', text: '✓' }
      : status === 'unavailable'
        ? { bg: 'var(--color-danger)', fg: '#fff', text: '✗' }
        : { bg: 'var(--color-accent-light)', fg: '#9a6b00', text: '?' };
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 34,
        height: 30,
        borderRadius: 'var(--radius-sm)',
        background: look.bg,
        color: look.fg,
        fontWeight: 800,
        verticalAlign: 'middle',
        border: status === null ? '1px dashed #e6a100' : 'none',
      }}
    >
      {look.text}
    </span>
  );
}
