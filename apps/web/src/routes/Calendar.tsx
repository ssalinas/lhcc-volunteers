import { useMemo, useState } from 'react';
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  subMonths,
} from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { useSession } from '../auth/client.js';
import { useOccurrences } from '../api/hooks.js';

export default function Calendar() {
  const [cursor, setCursor] = useState(() => new Date());
  const { data: session } = useSession();
  const isAdmin = (session?.user as { role?: string } | undefined)?.role === 'admin';
  const navigate = useNavigate();

  const monthStart = startOfMonth(cursor);
  const monthEnd = endOfMonth(cursor);
  const gridStart = startOfWeek(monthStart);
  const gridEnd = endOfWeek(monthEnd);
  const days = useMemo(() => eachDayOfInterval({ start: gridStart, end: gridEnd }), [gridStart, gridEnd]);

  const { data: occurrences, isLoading } = useOccurrences(gridStart.toISOString(), gridEnd.toISOString());

  const byDay = useMemo(() => {
    const map = new Map<string, typeof occurrences>();
    for (const o of occurrences ?? []) {
      const key = format(new Date(o.startAt), 'yyyy-MM-dd');
      const list = map.get(key) ?? [];
      list.push(o);
      map.set(key, list as typeof occurrences);
    }
    return map;
  }, [occurrences]);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <h1 style={{ margin: 0 }}>{format(cursor, 'MMMM yyyy')}</h1>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button type="button" onClick={() => setCursor((d) => subMonths(d, 1))} className="btn btn-secondary btn-sm">
            ← Prev
          </button>
          <button type="button" onClick={() => setCursor(new Date())} className="btn btn-secondary btn-sm">
            Today
          </button>
          <button type="button" onClick={() => setCursor((d) => addMonths(d, 1))} className="btn btn-secondary btn-sm">
            Next →
          </button>
        </div>
      </div>

      {isLoading && <p>Loading…</p>}

      <div className="calendar-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
          <div key={d} className="calendar-weekday-label" style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--color-text-faint)', textAlign: 'center', padding: '0.25rem' }}>
            {d}
          </div>
        ))}
        {days.map((day) => {
          const key = format(day, 'yyyy-MM-dd');
          const dayOccurrences = byDay.get(key) ?? [];
          const isToday = isSameDay(day, new Date());
          return (
            <div
              key={key}
              className="calendar-day-cell card"
              style={{
                minHeight: 90,
                padding: '0.4rem',
                opacity: isSameMonth(day, cursor) ? 1 : 0.45,
                boxShadow: 'none',
                border: isToday ? '1.5px solid var(--color-primary)' : '1px solid var(--color-border)',
                background: isToday ? 'var(--color-primary-light)' : 'var(--color-surface)',
              }}
            >
              <div style={{ fontSize: '0.75rem', fontWeight: isToday ? 700 : 400, color: isToday ? 'var(--color-primary)' : 'var(--color-text-muted)', marginBottom: '0.25rem' }}>
                {format(day, 'd')}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                {dayOccurrences.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    className="calendar-occurrence-chip"
                    onClick={() => isAdmin && navigate(`/admin/occurrences/${o.id}`)}
                    style={{
                      textAlign: 'left',
                      fontSize: '0.7rem',
                      padding: '0.2rem 0.35rem',
                      borderRadius: 5,
                      border: 'none',
                      cursor: isAdmin ? 'pointer' : 'default',
                      background: o.isMineAssigned ? 'var(--color-primary)' : 'var(--color-primary-light)',
                      color: o.isMineAssigned ? '#fff' : 'var(--color-primary)',
                      fontFamily: 'inherit',
                    }}
                    title={`${o.eventName} · ${format(new Date(o.startAt), 'p')} · ${o.filledSlots}/${o.totalSlots} filled`}
                  >
                    {format(new Date(o.startAt), 'p')} {o.eventName}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: '1.25rem', fontSize: '0.85rem', color: 'var(--color-text-muted)', display: 'flex', gap: '1.25rem', alignItems: 'center' }}>
        <LegendSwatch color="var(--color-primary)" label="You're assigned" />
        <LegendSwatch color="var(--color-primary-light)" label="Volunteer opportunity" />
      </div>
    </div>
  );
}

function LegendSwatch({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
      <span style={{ width: 14, height: 14, borderRadius: 4, background: color }} />
      {label}
    </span>
  );
}
