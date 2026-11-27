import type { OccurrenceDetail } from '@lhcc/shared';

/**
 * Read-only "who's serving in each role" list for one occurrence — shared by the volunteer
 * `/occurrences/:id` page and the Calendar's click-an-event popup so the two never drift apart.
 */
export function OccurrenceRoster({
  occurrence,
  currentUserId,
}: {
  occurrence: OccurrenceDetail;
  currentUserId?: string;
}) {
  if (occurrence.roles.length === 0) {
    return <p style={{ margin: 0 }}>No volunteer roles are needed for this event.</p>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {occurrence.roles.map((role) => {
        const activeAssignments = role.assignments.filter((a) => a.status !== 'declined');
        return (
          <div key={role.id} className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
              <strong>
                {role.name} <span style={{ fontWeight: 400, color: 'var(--color-text-faint)', fontSize: '0.8rem' }}>({role.teamName})</span>
              </strong>
              <span className={`badge ${activeAssignments.length >= role.slotsCount ? 'badge-success' : 'badge-warning'}`}>
                {activeAssignments.length}/{role.slotsCount} filled
              </span>
            </div>
            <div style={{ marginTop: '0.6rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
              {activeAssignments.map((a) => {
                const isMe = !!currentUserId && a.userId === currentUserId;
                return (
                  <div key={a.id} style={{ fontSize: '0.9rem', fontWeight: isMe ? 700 : 400 }}>
                    {a.user?.name ?? 'Volunteer'}
                    {isMe && ' (you)'}
                  </div>
                );
              })}
              {activeAssignments.length === 0 && (
                <span style={{ color: 'var(--color-text-faint)', fontSize: '0.85rem' }}>No one assigned yet.</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
