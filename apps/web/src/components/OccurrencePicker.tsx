import { useMemo, useState } from 'react';
import { endOfDay, format, startOfDay } from 'date-fns';
import type { OccurrenceSummary } from '@lhcc/shared';
import { useOccurrences } from '../api/hooks.js';

export interface OccurrenceGroup {
  eventId: string;
  eventName: string;
  occurrences: OccurrenceSummary[];
}

/**
 * Shared state for "pick a date range, then check off occurrences" — used by both the Batch
 * Schedule page (auto-schedule) and the Reminders page's custom schedule-notification section,
 * so both stay driven by the exact same selection mechanics rather than drifting apart.
 */
export function useOccurrencePicker(initialFromDate: string, initialToDate: string) {
  const [fromDate, setFromDate] = useState(initialFromDate);
  const [toDate, setToDate] = useState(initialToDate);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const fromISO = useMemo(() => startOfDay(new Date(fromDate)).toISOString(), [fromDate]);
  const toISO = useMemo(() => endOfDay(new Date(toDate)).toISOString(), [toDate]);

  const { data: occurrences, isLoading } = useOccurrences(fromISO, toISO);

  const groups = useMemo<OccurrenceGroup[]>(() => {
    const byEvent = new Map<string, OccurrenceGroup>();
    for (const o of occurrences ?? []) {
      if (o.status === 'canceled') continue;
      const group = byEvent.get(o.eventId) ?? { eventId: o.eventId, eventName: o.eventName, occurrences: [] };
      group.occurrences.push(o);
      byEvent.set(o.eventId, group);
    }
    return [...byEvent.values()].sort((a, b) => a.eventName.localeCompare(b.eventName));
  }, [occurrences]);

  const selectedEventCount = useMemo(
    () => new Set([...selected].map((id) => occurrences?.find((o) => o.id === id)?.eventId).filter(Boolean)).size,
    [selected, occurrences],
  );

  function toggleOccurrence(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleGroupSelection(group: OccurrenceGroup) {
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

  return {
    fromDate,
    setFromDate,
    toDate,
    setToDate,
    occurrences,
    isLoading,
    groups,
    selected,
    setSelected,
    toggleOccurrence,
    toggleGroupSelection,
    selectedEventCount,
  };
}

export function DateRangeFields({
  fromDate,
  setFromDate,
  toDate,
  setToDate,
}: {
  fromDate: string;
  setFromDate: (v: string) => void;
  toDate: string;
  setToDate: (v: string) => void;
}) {
  return (
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
  );
}

export function OccurrenceGroupList({
  groups,
  selected,
  onToggleOccurrence,
  onToggleGroup,
}: {
  groups: OccurrenceGroup[];
  selected: Set<string>;
  onToggleOccurrence: (id: string) => void;
  onToggleGroup: (group: OccurrenceGroup) => void;
}) {
  if (groups.length === 0) return <p>No occurrences in this date range.</p>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', marginBottom: '5rem' }}>
      {groups.map((group) => (
        <div key={group.eventId} className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <strong>{group.eventName}</strong>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', fontWeight: 500, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={group.occurrences.every((o) => selected.has(o.id))}
                onChange={() => onToggleGroup(group)}
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
                  <input type="checkbox" checked={selected.has(o.id)} onChange={() => onToggleOccurrence(o.id)} />
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
  );
}
