import { useMemo, useState } from 'react';
import { addWeeks, endOfDay, format, startOfDay } from 'date-fns';
import type { OccurrenceSummary } from '@lhcc/shared';
import { Modal } from '../../components/Modal.js';
import { useAutoScheduleSelected, useOccurrences, useSendScheduleNotifications } from '../../api/hooks.js';

export default function AdminBatchSchedule() {
  const [fromDate, setFromDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [toDate, setToDate] = useState(() => format(addWeeks(new Date(), 4), 'yyyy-MM-dd'));
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showAutoScheduleConfirm, setShowAutoScheduleConfirm] = useState(false);
  const [selectedRoleNames, setSelectedRoleNames] = useState<Set<string>>(new Set());
  const [autoScheduleMessage, setAutoScheduleMessage] = useState<string | null>(null);
  const [showNotifyConfirm, setShowNotifyConfirm] = useState(false);
  const [notifyMessage, setNotifyMessage] = useState<string | null>(null);

  const fromISO = useMemo(() => startOfDay(new Date(fromDate)).toISOString(), [fromDate]);
  const toISO = useMemo(() => endOfDay(new Date(toDate)).toISOString(), [toDate]);

  const { data: occurrences, isLoading } = useOccurrences(fromISO, toISO);
  const autoScheduleSelected = useAutoScheduleSelected();
  const sendNotifications = useSendScheduleNotifications();

  const groups = useMemo(() => {
    const byEvent = new Map<string, { eventId: string; eventName: string; occurrences: OccurrenceSummary[] }>();
    for (const o of occurrences ?? []) {
      if (o.status === 'canceled') continue;
      const group = byEvent.get(o.eventId) ?? { eventId: o.eventId, eventName: o.eventName, occurrences: [] };
      group.occurrences.push(o);
      byEvent.set(o.eventId, group);
    }
    return [...byEvent.values()].sort((a, b) => a.eventName.localeCompare(b.eventName));
  }, [occurrences]);

  const selectedEventCount = new Set(
    [...selected].map((id) => (occurrences ?? []).find((o) => o.id === id)?.eventId).filter(Boolean),
  ).size;

  // Union of role names across every currently-selected occurrence (can span multiple events) —
  // drives the role checklist in the auto-schedule confirm modal.
  const selectedRoleNamesAvailable = useMemo(() => {
    const names = new Set<string>();
    for (const o of occurrences ?? []) {
      if (!selected.has(o.id)) continue;
      for (const name of o.roleNames) names.add(name);
    }
    return [...names].sort();
  }, [occurrences, selected]);

  function toggleOccurrence(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleGroupSelection(group: { occurrences: OccurrenceSummary[] }) {
    const groupIds = group.occurrences.map((o) => o.id);
    const allSelected = groupIds.every((id) => selected.has(id));
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of groupIds) {
        if (allSelected) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  }

  function toggleRoleName(roleName: string) {
    setSelectedRoleNames((prev) => {
      const next = new Set(prev);
      if (next.has(roleName)) next.delete(roleName);
      else next.add(roleName);
      return next;
    });
  }

  function openAutoScheduleConfirm() {
    setSelectedRoleNames(new Set(selectedRoleNamesAvailable));
    setShowAutoScheduleConfirm(true);
  }

  function handleAutoScheduleConfirm() {
    setAutoScheduleMessage(null);
    const roleNames =
      selectedRoleNames.size < selectedRoleNamesAvailable.length ? [...selectedRoleNames] : undefined;
    autoScheduleSelected.mutate(
      { occurrenceIds: [...selected], roleNames },
      {
        onSuccess: (results) => {
          const filled = results.reduce((sum, r) => sum + r.createdAssignments.length, 0);
          const gaps = results.reduce((sum, r) => sum + r.gaps.length, 0);
          setAutoScheduleMessage(
            `Filled ${filled} slot(s) across ${results.length} occurrence(s).` +
              (gaps > 0 ? ` ${gaps} slot(s) still need attention.` : ' Everything is staffed.'),
          );
          setShowAutoScheduleConfirm(false);
        },
      },
    );
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
        Select occurrences below — use "Select all" to grab a whole event's range at once — then
        auto-schedule and/or notify the teams involved about exactly what's selected.
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
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', fontWeight: 500, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={group.occurrences.every((o) => selected.has(o.id))}
                    onChange={() => toggleGroupSelection(group)}
                  />
                  Select all
                </label>
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
            flexWrap: 'wrap',
            gap: '0.75rem',
            boxShadow: '0 -1px 6px rgba(16,24,40,0.08)',
          }}
        >
          <span>
            {selected.size} occurrence(s) selected across {selectedEventCount} event(s)
          </span>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button type="button" onClick={openAutoScheduleConfirm} className="btn btn-secondary">
              Auto-schedule selected
            </button>
            <button type="button" onClick={() => setShowNotifyConfirm(true)} className="btn btn-primary">
              Send schedule notification
            </button>
          </div>
        </div>
      )}

      {showAutoScheduleConfirm && (
        <Modal title="Auto-schedule selected occurrences?" onClose={() => setShowAutoScheduleConfirm(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <p style={{ margin: 0 }}>
              Fill unfilled slots across the <strong>{selected.size}</strong> selected occurrence(s)? This only
              adds to unfilled slots — it won't change existing assignments.
            </p>
            {selectedRoleNamesAvailable.length > 1 && (
              <div>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.4rem' }}>Roles to schedule</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                  {selectedRoleNamesAvailable.map((roleName) => (
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
              <button type="button" onClick={() => setShowAutoScheduleConfirm(false)} className="btn btn-secondary">
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAutoScheduleConfirm}
                disabled={autoScheduleSelected.isPending || selectedRoleNames.size === 0}
                className="btn btn-primary"
              >
                {autoScheduleSelected.isPending ? 'Scheduling…' : 'Auto-schedule'}
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
