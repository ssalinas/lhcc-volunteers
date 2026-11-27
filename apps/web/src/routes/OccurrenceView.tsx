import { useParams } from 'react-router-dom';
import { format } from 'date-fns';
import { useOccurrence } from '../api/hooks.js';
import { useSession } from '../auth/client.js';
import { OccurrenceRoster } from '../components/OccurrenceRoster.js';

/** Read-only overview of an event occurrence for volunteers — who's serving in each role, no edit controls. */
export default function OccurrenceView() {
  const { occurrenceId } = useParams();
  const { data: occurrence, isLoading } = useOccurrence(occurrenceId);
  const { data: session } = useSession();

  if (isLoading || !occurrence) return <p>Loading…</p>;

  return (
    <div>
      <h1 style={{ marginBottom: 0 }}>{occurrence.eventName}</h1>
      <p style={{ color: 'var(--color-text-muted)', marginTop: '0.25rem' }}>
        {format(new Date(occurrence.startAt), 'PPPP p')} · {occurrence.location ?? 'No location set'}
      </p>
      <div style={{ marginTop: '1.5rem' }}>
        <OccurrenceRoster occurrence={occurrence} currentUserId={session?.user.id} />
      </div>
    </div>
  );
}
