import { useMemo, useState } from 'react';
import { addDays, format } from 'date-fns';
import type { AvailabilityStatus } from '@lhcc/shared';
import { useOccurrences, useAvailabilityFor, useSetAvailabilityForDate, useClearAvailabilityForDate } from '../api/hooks.js';

const HORIZON_DAYS = 120; // "next 4 months at maximum" — the automated reminder only nags about
// the next 2 (jobs/sendAvailabilityReminders.ts), so filling in further ahead means fewer trips.
const PAGE_SIZE = 10;

/**
 * Per-date availability checkboxes for every upcoming distinct occurrence date
 * (instead of a freeform date-range calendar) — lets us tell "said unavailable"
 * apart from "hasn't responded yet". Reused for both the volunteer's own
 * availability (userId omitted) and an admin editing someone else's (userId set).
 */
export function AvailabilityDateList({ userId }: { userId?: string }) {
  const now = useMemo(() => new Date(), []);
  const horizon = useMemo(() => addDays(now, HORIZON_DAYS), [now]);
  const { data: occurrences, isLoading: occurrencesLoading } = useOccurrences(now.toISOString(), horizon.toISOString());
  const { data: entries, isLoading: entriesLoading } = useAvailabilityFor(userId);
  const setForDate = useSetAvailabilityForDate(userId);
  const clearForDate = useClearAvailabilityForDate(userId);
  const [page, setPage] = useState(0);

  const dates = useMemo(() => {
    const byDate = new Map<string, Set<string>>();
    for (const o of occurrences ?? []) {
      const key = format(new Date(o.startAt), 'yyyy-MM-dd');
      const entry = byDate.get(key) ?? new Set<string>();
      entry.add(o.eventName);
      byDate.set(key, entry);
    }
    return [...byDate.entries()]
      .map(([date, eventNames]) => ({ date, eventNames: [...eventNames] }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [occurrences]);

  const statusByDate = useMemo(() => {
    const map = new Map<string, AvailabilityStatus>();
    for (const { date } of dates) {
      const covering = (entries ?? []).filter((e) => e.startDate <= date && date <= e.endDate);
      const status = covering.find((e) => e.status === 'unavailable')?.status ?? covering[0]?.status;
      if (status) map.set(date, status);
    }
    return map;
  }, [dates, entries]);

  const pageCount = Math.max(1, Math.ceil(dates.length / PAGE_SIZE));
  const pageDates = dates.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  function toggle(date: string, status: AvailabilityStatus) {
    if (statusByDate.get(date) === status) {
      clearForDate.mutate(date);
    } else {
      setForDate.mutate({ date, status });
    }
  }

  if (occurrencesLoading || entriesLoading) return <p>Loading…</p>;

  if (dates.length === 0) {
    return <p>No upcoming events in the next {HORIZON_DAYS} days to set availability for.</p>;
  }

  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {pageDates.map(({ date, eventNames }) => {
          const status = statusByDate.get(date);
          return (
            <div
              key={date}
              className="card"
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '0.5rem',
                padding: '0.5rem 1.1rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 600 }}>{format(new Date(`${date}T00:00:00`), 'EEE, MMM d')}</span>
                <span style={{ color: 'var(--color-text-faint)', fontSize: '0.8rem' }}>{eventNames.join(', ')}</span>
              </div>
              <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                <ToggleButton active={status === 'available'} variant="success" onClick={() => toggle(date, 'available')}>
                  Available
                </ToggleButton>
                <ToggleButton active={status === 'unavailable'} variant="danger" onClick={() => toggle(date, 'unavailable')}>
                  Unavailable
                </ToggleButton>
                {!status && <span style={{ color: 'var(--color-text-faint)', fontSize: '0.8rem' }}>Not yet responded</span>}
              </div>
            </div>
          );
        })}
      </div>

      {pageCount > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '1rem', marginTop: '1.25rem' }}>
          <button type="button" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} className="btn btn-secondary btn-sm">
            ← Prev
          </button>
          <span style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
            Page {page + 1} of {pageCount}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
            disabled={page >= pageCount - 1}
            className="btn btn-secondary btn-sm"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}

function ToggleButton({
  active,
  variant,
  onClick,
  children,
}: {
  active: boolean;
  variant: 'success' | 'danger';
  onClick: () => void;
  children: React.ReactNode;
}) {
  const activeBg = variant === 'success' ? 'var(--color-success)' : 'var(--color-danger)';
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '0.4rem 0.8rem',
        borderRadius: 'var(--radius-sm)',
        border: `1px solid ${active ? activeBg : 'var(--color-border)'}`,
        background: active ? activeBg : 'var(--color-surface)',
        color: active ? '#fff' : 'var(--color-text)',
        cursor: 'pointer',
        fontSize: '0.85rem',
        fontFamily: 'inherit',
        fontWeight: 600,
      }}
    >
      {children}
    </button>
  );
}
