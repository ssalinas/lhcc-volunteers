import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { addWeeks, format } from 'date-fns';
import { useAdminEvents, useArchiveEvent, useOccurrences } from '../../api/hooks.js';

const UPCOMING_WEEKS = 8;

export default function AdminEvents() {
  const { data: events, isLoading } = useAdminEvents();
  const archive = useArchiveEvent();
  const navigate = useNavigate();

  const now = useMemo(() => new Date(), []);
  const horizon = useMemo(() => addWeeks(now, UPCOMING_WEEKS), [now]);
  const { data: occurrences, isLoading: occurrencesLoading } = useOccurrences(now.toISOString(), horizon.toISOString());

  const upcoming = [...(occurrences ?? [])]
    .filter((o) => o.status !== 'canceled')
    .sort((a, b) => a.startAt.localeCompare(b.startAt));

  return (
    <div>
      <h1 style={{ marginBottom: '0.5rem' }}>Upcoming Occurrences</h1>
      <p style={{ marginTop: 0, color: 'var(--color-text-muted)' }}>Next {UPCOMING_WEEKS} weeks — click one to schedule volunteers.</p>

      {occurrencesLoading ? (
        <p>Loading…</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '2.5rem' }}>
          {upcoming.map((o) => {
            const fullyStaffed = o.totalSlots > 0 && o.filledSlots >= o.totalSlots;
            return (
              <button
                key={o.id}
                type="button"
                onClick={() => navigate(`/admin/occurrences/${o.id}`)}
                className="card card-hover"
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '0.85rem 1.1rem',
                  border: 'none',
                  cursor: 'pointer',
                  textAlign: 'left',
                  width: '100%',
                  fontFamily: 'inherit',
                }}
              >
                <span>
                  <strong>{o.eventName}</strong>{' '}
                  <span style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>{format(new Date(o.startAt), 'EEE, MMM d · p')}</span>
                </span>
                <span className={`badge ${o.totalSlots === 0 ? 'badge-neutral' : fullyStaffed ? 'badge-success' : 'badge-warning'}`}>
                  {o.totalSlots === 0 ? 'No roles' : fullyStaffed ? 'Fully staffed' : `Needs volunteers (${o.filledSlots}/${o.totalSlots})`}
                </span>
              </button>
            );
          })}
          {upcoming.length === 0 && <p>No upcoming occurrences in the next {UPCOMING_WEEKS} weeks.</p>}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h1 style={{ margin: 0 }}>Events</h1>
        <Link to="/admin/events/new" className="btn btn-primary">
          + New event
        </Link>
      </div>

      {isLoading ? (
        <p>Loading…</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          {events?.map((e) => (
            <div key={e.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 600 }}>{e.name}</div>
                <div style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
                  {e.isRecurring ? `Recurring · ${e.rrule}` : 'One-off'} · {e.defaultStartTime} · {e.location ?? 'No location set'}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <Link to={`/admin/events/${e.id}`} className="btn btn-secondary btn-sm">
                  Edit
                </Link>
                <button
                  type="button"
                  onClick={() => confirm(`Archive "${e.name}"? Existing occurrences are kept, but no new ones will be generated.`) && archive.mutate(e.id)}
                  className="btn btn-secondary btn-sm"
                >
                  Archive
                </button>
              </div>
            </div>
          ))}
          {events?.length === 0 && <p>No events yet — create one to get started.</p>}
        </div>
      )}
    </div>
  );
}
