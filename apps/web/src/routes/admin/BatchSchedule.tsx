import { useMemo, useState } from 'react';
import { addWeeks, format } from 'date-fns';
import { Modal } from '../../components/Modal.js';
import { DateRangeFields, OccurrenceGroupList, useOccurrencePicker } from '../../components/OccurrencePicker.js';
import { useAutoScheduleSelected } from '../../api/hooks.js';

export default function AdminBatchSchedule() {
  const picker = useOccurrencePicker(format(new Date(), 'yyyy-MM-dd'), format(addWeeks(new Date(), 4), 'yyyy-MM-dd'));
  const { fromDate, setFromDate, toDate, setToDate, occurrences, isLoading, groups, selected, toggleOccurrence, toggleGroupSelection } =
    picker;

  const [showAutoScheduleConfirm, setShowAutoScheduleConfirm] = useState(false);
  const [selectedRoleNames, setSelectedRoleNames] = useState<Set<string>>(new Set());
  const [autoScheduleMessage, setAutoScheduleMessage] = useState<string | null>(null);

  const autoScheduleSelected = useAutoScheduleSelected();

  // Union of role names across every currently-selected occurrence (can span multiple events) —
  // drives the role checklist in the confirm modal.
  const selectedRoleNamesAvailable = useMemo(() => {
    const names = new Set<string>();
    for (const o of occurrences ?? []) {
      if (!selected.has(o.id)) continue;
      for (const name of o.roleNames) names.add(name);
    }
    return [...names].sort();
  }, [occurrences, selected]);

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

  return (
    <div>
      <h1 style={{ marginBottom: '0.25rem' }}>Batch Scheduling</h1>
      <p style={{ marginTop: 0, color: 'var(--color-text-muted)' }}>
        Select occurrences below — use "Select all" to grab a whole event's range at once — then
        auto-schedule exactly what's selected. Head to Reminders to notify volunteers afterward.
      </p>

      <DateRangeFields fromDate={fromDate} setFromDate={setFromDate} toDate={toDate} setToDate={setToDate} />

      {autoScheduleMessage && (
        <p style={{ background: 'var(--color-primary-light)', padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)' }}>
          {autoScheduleMessage}
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
          <button type="button" onClick={openAutoScheduleConfirm} className="btn btn-primary">
            Auto-schedule selected
          </button>
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
    </div>
  );
}
