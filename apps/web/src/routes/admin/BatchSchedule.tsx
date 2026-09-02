import { useMemo, useState } from 'react';
import { addWeeks, endOfDay, format, startOfDay } from 'date-fns';
import type { OccurrenceSummary } from '@lhcc/shared';
import { Modal } from '../../components/Modal.js';
import { useAutoScheduleRange, useOccurrences, useSendScheduleNotifications } from '../../api/hooks.js';

export default function AdminBatchSchedule() {
  const [fromDate, setFromDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [toDate, setToDate] = useState(() => format(addWeeks(new Date(), 4), 'yyyy-MM-dd'));
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmingEvent, setConfirmingEvent] = useState<{ eventId: string; eventName: string; roleNames: string[] } | null>(
    null,
  );
  const [selectedRoleNames, setSelectedRoleNames] = useState<Set<string>>(new Set());
  const [autoScheduleMessage, setAutoScheduleMessage] = useState<string | null>(null);
  const [showNotifyConfirm, setShowNotifyConfirm] = useState(false);
  const [notifyMessage, setNotifyMessage] = useState<string | null>(null);

  const fromISO = useMemo(() => startOfDay(new Date(fromDate)).toISOString(), [fromDate]);
  const toISO = useMemo(() => endOfDay(new Date(toDate)).toISOString(), [toDate]);

  const { data: occurrences, isLoading } = useOccurrences(fromISO, toISO);
  const autoScheduleRange = useAutoScheduleRange();
  const sendNotifications = useSendScheduleNotifications();

  const groups = useMemo(() => {
    const byEvent = new Map<string, { eventId: string; eventName: string; occurrences: OccurrenceSummary[] }>();
    for (const o of occurrences ?? []) {
      if (o.status === 'canceled') continue;
      const group = byEvent.get(o.eventId) ?? { eventId: o.eventId, eventName: o.eventName, occurrences: [] };
      group.occurrences.push(o);
      byEvent.set(o.eventId, group);
    }
    return [...byEvent.values()]
      .map((group) => ({
        ...group,
        roleNames: [...new Set(group.occurrences.flatMap((o) => o.roleNames))].sort(),
      }))
      .sort((a, b) => a.eventName.localeCompare(b.eventName));
  }, [occurrences]);

  const selectedEventCount = new Set(
    [...selected].map((id) => (occurrences ?? []).find((o) => o.id === id)?.eventId).filter(Boolean),
  ).size;

  function toggleOccurrence(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleAutoScheduleConfirm() {
    if (!confirmingEvent) return;
    setAutoScheduleMessage(null);
    const roleNames = selectedRoleNames.size < confirmingEvent.roleNames.length ? [...selectedRoleNames] : undefined;
    autoScheduleRange.mutate(
      { eventId: confirmingEvent.eventId, from: fromISO, to: toISO, roleNames },
      {
        onSuccess: (result) => {
          const filled = result.results.reduce((sum, r) => sum + r.createdAssignments.length, 0);
          const gaps = result.results.reduce((sum, r) => sum + r.gaps.length, 0);
          setAutoScheduleMessage(
            `${confirmingEvent.eventName}: filled ${filled} slot(s) across ${result.results.length} occurrence(s).` +
              (gaps > 0 ? ` ${gaps} slot(s) still need attention.` : ' Everything is staffed.'),
          );
          setConfirmingEvent(null);
        },
      },
    );
  }

  function toggleRoleName(roleName: string) {
    setSelectedRoleNames((prev) => {
      const next = new Set(prev);
      if (next.has(roleName)) next.delete(roleName);
      else next.add(roleName);
      return next;
    });
  }

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
      <h1 style={{ marginBottom: '0.25rem' }}>Batch Scheduling</h1>
      <p style={{ marginTop: 0, color: 'var(--color-text-muted)' }}>
        Auto-schedule a recurring event across a date range at once, then notify everyone on the teams
        involved about the result.
      </p>

      <div className="card" style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.85rem' }}>
          From
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.85rem' }}>
          To
          <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
        </label>
      </div>

      {autoScheduleMessage && (
        <p style={{ background: 'var(--color-primary-light)', padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)' }}>
          {autoScheduleMessage}
        </p>
      )}
      {notifyMessage && (
        <p style={{ background: 'var(--color-primary-light)', padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)' }}>
          {notifyMessage}
        </p>
      )}

      {isLoading ? (
        <p>Loading…</p>
      ) : groups.length === 0 ? (
        <p>No occurrences in this date range.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', marginBottom: '5rem' }}>
          {groups.map((group) => (
            <div key={group.eventId} className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <strong>{group.eventName}</strong>
                <button
                  type="button"
                  onClick={() => {
                    setConfirmingEvent({ eventId: group.eventId, eventName: group.eventName, roleNames: group.roleNames });
                    setSelectedRoleNames(new Set(group.roleNames));
                  }}
                  className="btn btn-secondary btn-sm"
                >
                  Auto-schedule this range
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {group.occurrences.map((o) => {
                  const fullyStaffed = o.totalSlots > 0 && o.filledSlots >= o.totalSlots;
                  return (
                    <label
                      key={o.id}
                      style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.4rem 0', fontSize: '0.9rem' }}
                    >
                      <input type="checkbox" checked={selected.has(o.id)} onChange={() => toggleOccurrence(o.id)} />
                      <span>{format(new Date(o.startAt), 'EEE, MMM d · p')}</span>
                      <span className={`badge ${o.totalSlots === 0 ? 'badge-neutral' : fullyStaffed ? 'badge-success' : 'badge-warning'}`}>
                        {o.totalSlots === 0 ? 'No roles' : fullyStaffed ? 'Fully staffed' : `${o.filledSlots}/${o.totalSlots}`}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
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
            boxShadow: '0 -1px 6px rgba(16,24,40,0.08)',
          }}
        >
          <span>
            {selected.size} occurrence(s) selected across {selectedEventCount} event(s)
          </span>
          <button type="button" onClick={() => setShowNotifyConfirm(true)} className="btn btn-primary">
            Send schedule notification
          </button>
        </div>
      )}

      {confirmingEvent && (
        <Modal title="Auto-schedule this range?" onClose={() => setConfirmingEvent(null)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <p style={{ margin: 0 }}>
              Fill unfilled slots for <strong>{confirmingEvent.eventName}</strong> across every occurrence between{' '}
              <strong>{fromDate}</strong> and <strong>{toDate}</strong>? This only adds to unfilled slots — it won't
              change existing assignments.
            </p>
            {confirmingEvent.roleNames.length > 1 && (
              <div>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.4rem' }}>Roles to schedule</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                  {confirmingEvent.roleNames.map((roleName) => (
                    <label key={roleName} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem' }}>
                      <input
                        type="checkbox"
                        checked={selectedRoleNames.has(roleName)}
                        onChange={() => toggleRoleName(roleName)}
                      />
                      {roleName}
                    </label>
                  ))}
                </div>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
              <button type="button" onClick={() => setConfirmingEvent(null)} className="btn btn-secondary">
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAutoScheduleConfirm}
                disabled={autoScheduleRange.isPending || selectedRoleNames.size === 0}
                className="btn btn-primary"
              >
                {autoScheduleRange.isPending ? 'Scheduling…' : 'Auto-schedule'}
              </button>
            </div>
          </div>
        </Modal>
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
