import { useParams } from 'react-router-dom';
import { format } from 'date-fns';
import { useOccurrence } from '../api/hooks.js';

/** Read-only overview of an event occurrence for volunteers — who's serving in each role, no edit controls. */
export default function OccurrenceView() {
  const { occurrenceId } = useParams();
  const { data: occurrence, isLoading } = useOccurrence(occurrenceId);

  if (isLoading || !occurrence) return <p>Loading…</p>;

  return (
    <div>
      <h1 style={{ marginBottom: 0 }}>{occurrence.eventName}</h1>
      <p style={{ color: 'var(--color-text-muted)', marginTop: '0.25rem' }}>
        {format(new Date(occurrence.startAt), 'PPPP p')} · {occurrence.location ?? 'No location set'}
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1.5rem' }}>
        {occurrence.roles.map((role) => {
          const activeAssignments = role.assignments.filter((a) => a.status !== 'declined');
          return (
            <div key={role.id} className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong>
                  {role.name} <span style={{ fontWeight: 400, color: 'var(--color-text-faint)', fontSize: '0.8rem' }}>({role.teamName})</span>
                </strong>
                <span className={`badge ${activeAssignments.length >= role.slotsCount ? 'badge-success' : 'badge-warning'}`}>
                  {activeAssignments.length}/{role.slotsCount} filled
                </span>
              </div>
              <div style={{ marginTop: '0.6rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                {activeAssignments.map((a) => (
                  <div key={a.id} style={{ fontSize: '0.9rem' }}>
                    {a.user?.name ?? 'Volunteer'}
                  </div>
                ))}
                {activeAssignments.length === 0 && (
                  <span style={{ color: 'var(--color-text-faint)', fontSize: '0.85rem' }}>No one assigned yet.</span>
                )}
              </div>
            </div>
          );
        })}
        {occurrence.roles.length === 0 && <p>No volunteer roles are needed for this event.</p>}
      </div>
    </div>
  );
}
