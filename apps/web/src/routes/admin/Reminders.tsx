import { useMemo, useState } from 'react';
import { addMonths, addWeeks, format, formatDistanceToNow } from 'date-fns';
import { Modal } from '../../components/Modal.js';
import { DateRangeFields, OccurrenceGroupList, useOccurrencePicker } from '../../components/OccurrencePicker.js';
import {
  useAdminEvents,
  useAvailabilityReminderStatus,
  useEventsLastNotified,
  useOccurrences,
  useSendAvailabilityRemindersNow,
  useSendScheduleNotifications,
} from '../../api/hooks.js';

export default function AdminReminders() {
  return (
    <div>
      <h1>Reminders</h1>
      <p style={{ marginTop: 0, color: 'var(--color-text-muted)' }}>
        Everything that emails volunteers lives here: availability nudges and schedule notifications.
      </p>

      <section style={{ marginBottom: '2rem' }}>
        <h2>Availability reminders</h2>
        <AvailabilityRemindersCard />
      </section>

      <section style={{ marginBottom: '2rem' }}>
        <h2>Remind chosen volunteers</h2>
        <ChosenVolunteersReminderCard />
      </section>

      <section>
        <h2>Custom schedule notification</h2>
        <p style={{ marginTop: 0, color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
          Pick a date range and hand-select specific occurrences — more control than the quick option above.
        </p>
        <ScheduleNotificationSection />
      </section>
    </div>
  );
}

function AvailabilityRemindersCard() {
  const { data: status } = useAvailabilityReminderStatus();
  const sendNow = useSendAvailabilityRemindersNow();
  const [message, setMessage] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  function handleSendNow() {
    setMessage(null);
    sendNow.mutate(undefined, {
      onSuccess: (result) => {
        setMessage(
          result.remindersSent > 0
            ? `Sent to ${result.remindersSent} volunteer(s).`
            : "Everyone's availability is already set for the next month.",
        );
        setShowConfirm(false);
      },
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
        <div style={{ color: 'var(--color-text-faint)', fontSize: '0.78rem', marginTop: '0.3rem' }}>
          {status?.lastSentAt
            ? `Last sent ${formatDistanceToNow(new Date(status.lastSentAt), { addSuffix: true })} — ${status.remindersSent} volunteer(s), ${status.triggeredBy === 'manual' ? 'sent manually' : 'automatic'}`
            : 'No reminders sent yet.'}
        </div>
        {message && <div style={{ fontSize: '0.85rem', marginTop: '0.4rem' }}>{message}</div>}
      </div>
      <button type="button" onClick={() => setShowConfirm(true)} className="btn btn-primary btn-sm">
        Send reminders now
      </button>

      {showConfirm && (
        <Modal title="Send availability reminders now?" onClose={() => setShowConfirm(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <p style={{ margin: 0 }}>
              This emails everyone with unset availability in the next month, as an extra nudge outside the
              regular automatic schedule.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
              <button type="button" onClick={() => setShowConfirm(false)} className="btn btn-secondary">
                Cancel
              </button>
              <button type="button" onClick={handleSendNow} disabled={sendNow.isPending} className="btn btn-primary">
                {sendNow.isPending ? 'Sending…' : 'Send'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function ChosenVolunteersReminderCard() {
  const { data: events } = useAdminEvents();
  const { data: lastNotified } = useEventsLastNotified();
  const now = useMemo(() => new Date(), []);
  const horizon = useMemo(() => addMonths(now, 1), [now]);
  const { data: occurrences } = useOccurrences(now.toISOString(), horizon.toISOString());
  const [selectedEventIds, setSelectedEventIds] = useState<Set<string>>(new Set());
  const [showConfirm, setShowConfirm] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const sendNotifications = useSendScheduleNotifications();

  const lastNotifiedByEvent = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of lastNotified ?? []) map.set(item.eventId, item.lastSentAt);
    return map;
  }, [lastNotified]);

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
        Pick one or more events to email everyone on their team(s) about the schedule for the next month — a
        quick, auto-scoped shortcut for the custom notification below.
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem' }}>
        {events?.map((e) => {
          const last = lastNotifiedByEvent.get(e.id);
          return (
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
              {last && (
                <span style={{ color: 'var(--color-text-faint)', fontSize: '0.72rem' }}>
                  · notified {formatDistanceToNow(new Date(last), { addSuffix: true })}
                </span>
              )}
            </label>
          );
        })}
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

function ScheduleNotificationSection() {
  const picker = useOccurrencePicker(format(new Date(), 'yyyy-MM-dd'), format(addWeeks(new Date(), 4), 'yyyy-MM-dd'));
  const { fromDate, setFromDate, toDate, setToDate, isLoading, groups, selected, setSelected, toggleOccurrence, toggleGroupSelection } =
    picker;
  const [showNotifyConfirm, setShowNotifyConfirm] = useState(false);
  const [notifyMessage, setNotifyMessage] = useState<string | null>(null);
  const sendNotifications = useSendScheduleNotifications();

  function handleSendNotifications() {
    setNotifyMessage(null);
    sendNotifications.mutate([...selected], {
      onSuccess: (result) => {
        setNotifyMessage(
          `Sent to ${result.recipientCount} volunteer(s) about ${result.occurrenceCount} occurrence(s).`,
        );
        setSelected(new Set());
        setShowNotifyConfirm(false);
      },
    });
  }

  return (
    <div>
      <DateRangeFields fromDate={fromDate} setFromDate={setFromDate} toDate={toDate} setToDate={setToDate} />

      {notifyMessage && (
        <p style={{ background: 'var(--color-primary-light)', padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)' }}>
          {notifyMessage}
        </p>
      )}

      {isLoading ? (
        <p>Loading…</p>
      ) : (
        <OccurrenceGroupList
          groups={groups}
          selected={selected}
          onToggleOccurrence={toggleOccurrence}
          onToggleGroup={toggleGroupSelection}
        />
      )}

      {selected.size > 0 && (
        <div
          style={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            background: '#fff',
            borderTop: '1px solid var(--color-border)',
            padding: '0.85rem 1.75rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '0.75rem',
            boxShadow: '0 -1px 6px rgba(16,24,40,0.08)',
          }}
        >
          <span>{selected.size} occurrence(s) selected</span>
          <button type="button" onClick={() => setShowNotifyConfirm(true)} className="btn btn-primary">
            Send schedule notification
          </button>
        </div>
      )}

      {showNotifyConfirm && (
        <Modal title="Send schedule notification?" onClose={() => setShowNotifyConfirm(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <p style={{ margin: 0 }}>
              This will email everyone on the team(s) involved in the <strong>{selected.size}</strong> selected
              occurrence(s) — not just who's assigned — with the full schedule and roster so everyone stays in the
              loop.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
              <button type="button" onClick={() => setShowNotifyConfirm(false)} className="btn btn-secondary">
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSendNotifications}
                disabled={sendNotifications.isPending}
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
