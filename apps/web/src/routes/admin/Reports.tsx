import { useMemo, useState } from 'react';
import { addMonths, addWeeks, format, formatDistanceToNow } from 'date-fns';
import { StackedBarChart, type StackedBarDatum } from '../../components/StackedBarChart.js';
import { Modal } from '../../components/Modal.js';
import {
  useAdminEvents,
  useBackupStatus,
  useCoverageReport,
  useOccurrences,
  useSendAvailabilityRemindersNow,
  useSendScheduleNotifications,
  useTeamSummaryReport,
  useTriggerBackup,
  useVolunteerHistoryReport,
} from '../../api/hooks.js';

const COLORS = ['#0a7dcd', '#e6a100', '#2e7d5b', '#6bb0e8', '#c0392b'];

export default function AdminReports() {
  const { data: history, isLoading: historyLoading } = useVolunteerHistoryReport();
  const { data: teamSummary, isLoading: summaryLoading } = useTeamSummaryReport(8);

  const now = useMemo(() => new Date(), []);
  const horizon = useMemo(() => addWeeks(now, 8), [now]);
  const { data: gaps } = useCoverageReport(now.toISOString(), horizon.toISOString());

  const teamNames = useMemo(() => [...new Set((history ?? []).map((h) => h.teamName))], [history]);

  const chartData: StackedBarDatum[] = useMemo(() => {
    if (!history) return [];
    const byUser = new Map<string, StackedBarDatum>();
    for (const entry of history) {
      const row = byUser.get(entry.userId) ?? { name: entry.userName, segments: [] };
      row.segments.push({
        label: entry.teamName,
        value: entry.totalAssignments,
        color: COLORS[teamNames.indexOf(entry.teamName) % COLORS.length],
      });
      byUser.set(entry.userId, row);
    }
    return [...byUser.values()];
  }, [history, teamNames]);

  return (
    <div>
      <h1>Reports</h1>

      <section style={{ marginBottom: '2rem' }}>
        <h2>Backups</h2>
        <BackupsCard />
      </section>

      <section style={{ marginBottom: '2rem' }}>
        <h2>Notifications</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <AvailabilityRemindersCard />
          <ChosenVolunteersReminderCard />
        </div>
      </section>

      <section style={{ marginBottom: '2rem' }}>
        <h2>Team activity (last 8 weeks)</h2>
        {summaryLoading ? (
          <p>Loading…</p>
        ) : (
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            {teamSummary?.map((t) => (
              <div key={t.teamId} className="card" style={{ minWidth: 180 }}>
                <div style={{ fontWeight: 600 }}>{t.teamName}</div>
                <div style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--color-primary)' }}>{t.assignmentsInWindow}</div>
                <div style={{ color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>
                  assignments across {t.distinctVolunteersInWindow} of {t.memberCount} members
                </div>
              </div>
            ))}
            {teamSummary?.length === 0 && <p>No teams yet.</p>}
          </div>
        )}
      </section>

      <section style={{ marginBottom: '2rem' }}>
        <h2>Volunteer load by team (all time)</h2>
        {historyLoading ? (
          <p>Loading…</p>
        ) : chartData.length === 0 ? (
          <p>No assignment history yet.</p>
        ) : (
          <div className="card" style={{ padding: '1.5rem 1.25rem 1.25rem' }}>
            <StackedBarChart data={chartData} />
            <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem', fontSize: '0.8rem', color: 'var(--color-text-muted)', flexWrap: 'wrap' }}>
              {teamNames.map((teamName, i) => (
                <span key={teamName} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                  <span style={{ width: 12, height: 12, borderRadius: 3, background: COLORS[i % COLORS.length] }} />
                  {teamName}
                </span>
              ))}
            </div>
          </div>
        )}
      </section>

      <section>
        <h2>Upcoming coverage gaps (next 8 weeks)</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {gaps?.map((g, i) => (
            <div key={i} className="card" style={{ display: 'flex', justifyContent: 'space-between', padding: '0.6rem 1.1rem', fontSize: '0.9rem' }}>
              <span>
                {g.eventName} — {g.roleName}
              </span>
              <span style={{ color: 'var(--color-text-muted)' }}>
                {format(new Date(g.startAt), 'PP')} · {g.slotsFilled}/{g.slotsNeeded} filled
              </span>
            </div>
          ))}
          {gaps?.length === 0 && <p>No gaps — everything's staffed for the next 8 weeks.</p>}
        </div>
      </section>
    </div>
  );
}

function BackupsCard() {
  const { data: status, isLoading } = useBackupStatus();
  const triggerBackup = useTriggerBackup();
  const [message, setMessage] = useState<string | null>(null);

  if (isLoading) return <p>Loading…</p>;

  const latestLocal = status?.local[0];
  const latestR2 = status?.r2[0];
  const isSynced = !!latestLocal && !!latestR2 && latestLocal.name === latestR2.name;

  function handleRunNow() {
    setMessage(null);
    triggerBackup.mutate(undefined, {
      onSuccess: (result) =>
        setMessage(
          result.uploadedToR2
            ? 'Backup complete and synced to Cloudflare R2.'
            : 'Backup complete (local only — R2 not configured or the upload failed; check server logs).',
        ),
      onError: (err) => setMessage(err instanceof Error ? err.message : 'Backup failed'),
    });
  }

  return (
    <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
      <div>
        {latestLocal ? (
          <>
            <div style={{ fontWeight: 600 }}>
              Last backup {formatDistanceToNow(new Date(latestLocal.createdAt), { addSuffix: true })}
            </div>
            <div style={{ color: 'var(--color-text-muted)', fontSize: '0.8rem', marginTop: '0.15rem' }}>
              {format(new Date(latestLocal.createdAt), 'PPPp')} · {status?.local.length} local ·{' '}
              {status?.r2.length ?? 0} in R2
            </div>
          </>
        ) : (
          <div style={{ color: 'var(--color-text-muted)' }}>No backups yet.</div>
        )}
        {message && <div style={{ fontSize: '0.85rem', marginTop: '0.4rem' }}>{message}</div>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        {!status?.r2Configured ? (
          <span className="badge badge-warning">Off-Pi backup not configured</span>
        ) : isSynced ? (
          <span className="badge badge-success">Synced to Cloudflare R2</span>
        ) : (
          <span className="badge badge-warning">Not yet synced</span>
        )}
        <button type="button" onClick={handleRunNow} disabled={triggerBackup.isPending} className="btn btn-primary btn-sm">
          {triggerBackup.isPending ? 'Backing up…' : 'Back up now'}
        </button>
      </div>
    </div>
  );
}

function AvailabilityRemindersCard() {
  const sendNow = useSendAvailabilityRemindersNow();
  const [message, setMessage] = useState<string | null>(null);

  function handleSendNow() {
    setMessage(null);
    sendNow.mutate(undefined, {
      onSuccess: (result) =>
        setMessage(
          result.remindersSent > 0
            ? `Sent to ${result.remindersSent} volunteer(s).`
            : "Everyone's availability is already set for the next month.",
        ),
      onError: (err) => setMessage(err instanceof Error ? err.message : 'Failed to send reminders'),
    });
  }

  return (
    <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
      <div>
        <div style={{ fontWeight: 600 }}>Availability reminders</div>
        <div style={{ color: 'var(--color-text-muted)', fontSize: '0.8rem', marginTop: '0.15rem' }}>
          Runs automatically every day at 8:00 AM. "Send now" is an extra nudge, right now, to anyone missing
          availability in the next month.
        </div>
        {message && <div style={{ fontSize: '0.85rem', marginTop: '0.4rem' }}>{message}</div>}
      </div>
      <button type="button" onClick={handleSendNow} disabled={sendNow.isPending} className="btn btn-primary btn-sm">
        {sendNow.isPending ? 'Sending…' : 'Send reminders now'}
      </button>
    </div>
  );
}

function ChosenVolunteersReminderCard() {
  const { data: events } = useAdminEvents();
  const now = useMemo(() => new Date(), []);
  const horizon = useMemo(() => addMonths(now, 1), [now]);
  const { data: occurrences } = useOccurrences(now.toISOString(), horizon.toISOString());
  const [selectedEventIds, setSelectedEventIds] = useState<Set<string>>(new Set());
  const [showConfirm, setShowConfirm] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const sendNotifications = useSendScheduleNotifications();

  function toggleEvent(eventId: string) {
    setSelectedEventIds((prev) => {
      const next = new Set(prev);
      if (next.has(eventId)) next.delete(eventId);
      else next.add(eventId);
      return next;
    });
  }

  const matchingOccurrenceIds = (occurrences ?? [])
    .filter((o) => o.status !== 'canceled' && selectedEventIds.has(o.eventId))
    .map((o) => o.id);

  function handleSend() {
    setMessage(null);
    sendNotifications.mutate(matchingOccurrenceIds, {
      onSuccess: (result) => {
        setMessage(`Sent to ${result.recipientCount} volunteer(s) about ${result.occurrenceCount} occurrence(s).`);
        setShowConfirm(false);
        setSelectedEventIds(new Set());
      },
      onError: (err) => setMessage(err instanceof Error ? err.message : 'Failed to send notification'),
    });
  }

  return (
    <div className="card" style={{ padding: '1rem 1.1rem' }}>
      <div style={{ fontWeight: 600 }}>Remind chosen volunteers</div>
      <div style={{ color: 'var(--color-text-muted)', fontSize: '0.8rem', marginTop: '0.15rem', marginBottom: '0.75rem' }}>
        Pick one or more events to email everyone on their team(s) about the schedule for the next month — same as
        the Batch Schedule page's notification, just auto-scoped instead of picking occurrences by hand.
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem' }}>
        {events?.map((e) => (
          <label
            key={e.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.3rem 0.6rem',
              borderRadius: 999,
              border: '1px solid var(--color-border)',
              fontSize: '0.85rem',
            }}
          >
            <input type="checkbox" checked={selectedEventIds.has(e.id)} onChange={() => toggleEvent(e.id)} />
            {e.name}
          </label>
        ))}
        {events?.length === 0 && (
          <span style={{ color: 'var(--color-text-faint)', fontSize: '0.85rem' }}>No events yet.</span>
        )}
      </div>
      {message && <div style={{ fontSize: '0.85rem', marginBottom: '0.5rem' }}>{message}</div>}
      <button
        type="button"
        onClick={() => setShowConfirm(true)}
        disabled={selectedEventIds.size === 0}
        className="btn btn-primary btn-sm"
      >
        Send now
      </button>

      {showConfirm && (
        <Modal title="Send schedule notification?" onClose={() => setShowConfirm(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <p style={{ margin: 0 }}>
              This will email everyone on the team(s) involved in the <strong>{matchingOccurrenceIds.length}</strong>{' '}
              matching occurrence(s) over the next month — not just who's assigned — with the full schedule and
              roster so everyone stays in the loop.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
              <button type="button" onClick={() => setShowConfirm(false)} className="btn btn-secondary">
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSend}
                disabled={sendNotifications.isPending || matchingOccurrenceIds.length === 0}
                className="btn btn-primary"
              >
                {sendNotifications.isPending ? 'Sending…' : 'Send'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
