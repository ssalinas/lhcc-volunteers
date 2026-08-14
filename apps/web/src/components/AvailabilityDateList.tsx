import { useMemo, useState } from 'react';
import { addDays, format } from 'date-fns';
import type { AvailabilityStatus } from '@lhcc/shared';
import { useOccurrences, useAvailabilityFor, useSetAvailabilityForDate, useClearAvailabilityForDate } from '../api/hooks.js';

const HORIZON_DAYS = 60; // "next 2 months at maximum"
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
      const set = byDate.get(key) ?? new Set<string>();
      set.add(o.eventName);
      byDate.set(key, set);
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
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '0.5rem',
                padding: '0.65rem 1rem',
                background: '#fff',
                borderRadius: 8,
                boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
              }}
            >
              <div>
                <div style={{ fontWeight: 600 }}>{format(new Date(`${date}T00:00:00`), 'EEE, MMM d')}</div>
                <div style={{ color: '#888', fontSize: '0.8rem' }}>{eventNames.join(', ')}</div>
              </div>
              <div style={{ display: 'flex', gap: '0.4rem' }}>
                <ToggleButton active={status === 'available'} color="#2f6f4f" onClick={() => toggle(date, 'available')}>
                  Available
                </ToggleButton>
                <ToggleButton active={status === 'unavailable'} color="#b00020" onClick={() => toggle(date, 'unavailable')}>
                  Unavailable
                </ToggleButton>
                {!status && <span style={{ color: '#aaa', fontSize: '0.8rem', alignSelf: 'center' }}>Not yet responded</span>}
              </div>
            </div>
          );
        })}
      </div>

      {pageCount > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '1rem', marginTop: '1rem' }}>
          <button type="button" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} style={pageButtonStyle}>
            ← Prev
          </button>
          <span style={{ fontSize: '0.85rem', color: '#666' }}>
            Page {page + 1} of {pageCount}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
            disabled={page >= pageCount - 1}
            style={pageButtonStyle}
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
      style={{
        padding: '0.4rem 0.8rem',
        borderRadius: 6,
        border: `1px solid ${active ? color : '#ccc'}`,
        background: active ? color : '#fff',
        color: active ? '#fff' : '#333',
        cursor: 'pointer',
        fontSize: '0.85rem',
      }}
    >
      {children}
    </button>
  );
}

const pageButtonStyle: React.CSSProperties = {
  padding: '0.4rem 0.9rem',
  borderRadius: 6,
  border: '1px solid #ccc',
  background: '#fff',
  cursor: 'pointer',
  fontSize: '0.85rem',
};
