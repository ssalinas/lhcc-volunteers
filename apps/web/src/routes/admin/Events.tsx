import { Link } from 'react-router-dom';
import { useAdminEvents, useArchiveEvent } from '../../api/hooks.js';

export default function AdminEvents() {
  const { data: events, isLoading } = useAdminEvents();
  const archive = useArchiveEvent();

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h1 style={{ margin: 0 }}>Events</h1>
        <Link
          to="/admin/events/new"
          style={{ padding: '0.5rem 1.25rem', borderRadius: 8, background: '#2f6f4f', color: '#fff', textDecoration: 'none' }}
        >
          + New event
        </Link>
      </div>

      {isLoading ? (
        <p>Loading…</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          {events?.map((e) => (
            <div
              key={e.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '1rem',
                background: '#fff',
                borderRadius: 10,
                boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
              }}
            >
              <div>
                <div style={{ fontWeight: 600 }}>{e.name}</div>
                <div style={{ color: '#666', fontSize: '0.85rem' }}>
                  {e.isRecurring ? `Recurring · ${e.rrule}` : 'One-off'} · {e.defaultStartTime} · {e.location ?? 'No location set'}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <Link
                  to={`/admin/events/${e.id}`}
                  style={{ padding: '0.4rem 0.9rem', borderRadius: 8, border: '1px solid #ccc', textDecoration: 'none', color: '#333' }}
                >
                  Edit
                </Link>
                <button
                  type="button"
                  onClick={() => confirm(`Archive "${e.name}"? Existing occurrences are kept, but no new ones will be generated.`) && archive.mutate(e.id)}
                  style={{ padding: '0.4rem 0.9rem', borderRadius: 8, border: '1px solid #ccc', background: '#fff', cursor: 'pointer' }}
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
