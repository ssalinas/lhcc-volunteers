import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { format } from 'date-fns';
import type { CreateEventRoleTemplateInput } from '@lhcc/shared';
import { Modal } from '../../components/Modal.js';
import { useTeams } from '../../api/hooks.js';
import {
  useAddRoleTemplate,
  useAdminEvent,
  useCreateEvent,
  useDeleteRoleTemplate,
  useRegenerateOccurrences,
  useUpdateEvent,
} from '../../api/hooks.js';

const TIMEZONES = ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles'];
const WEEKDAYS = [
  { value: 'SU', label: 'Sunday' },
  { value: 'MO', label: 'Monday' },
  { value: 'TU', label: 'Tuesday' },
  { value: 'WE', label: 'Wednesday' },
  { value: 'TH', label: 'Thursday' },
  { value: 'FR', label: 'Friday' },
  { value: 'SA', label: 'Saturday' },
];

type RoleRow = CreateEventRoleTemplateInput;

export default function AdminEventEditor() {
  const { eventId } = useParams();
  const isEditing = !!eventId;
  const navigate = useNavigate();
  const { data: teams } = useTeams();
  const { data: existingEvent } = useAdminEvent(eventId);

  const createEvent = useCreateEvent();
  const updateEvent = useUpdateEvent();
  const addRoleTemplate = useAddRoleTemplate();
  const deleteRoleTemplate = useDeleteRoleTemplate();
  const regenerate = useRegenerateOccurrences();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [defaultStartTime, setDefaultStartTime] = useState('09:00');
  const [defaultDurationMinutes, setDefaultDurationMinutes] = useState(60);
  const [timezone, setTimezone] = useState('America/New_York');
  const [isRecurring, setIsRecurring] = useState(false);
  const [weekday, setWeekday] = useState('SU');
  const [dtstart, setDtstart] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [recurrenceEndDate, setRecurrenceEndDate] = useState('');
  const [occurrenceDate, setOccurrenceDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [regenerateAfterSave, setRegenerateAfterSave] = useState(false);

  useEffect(() => {
    if (!existingEvent) return;
    setName(existingEvent.name);
    setDescription(existingEvent.description ?? '');
    setLocation(existingEvent.location ?? '');
    setDefaultStartTime(existingEvent.defaultStartTime);
    setDefaultDurationMinutes(existingEvent.defaultDurationMinutes);
    setTimezone(existingEvent.timezone);
    setIsRecurring(existingEvent.isRecurring);
    setRecurrenceEndDate(existingEvent.recurrenceEndDate ?? '');
  }, [existingEvent]);

  function addRoleRow() {
    if (!teams || teams.length === 0) return;
    setRoles((r) => [...r, { teamId: teams[0].id, name: '', slotsCount: 1, stackable: false, sortOrder: r.length }]);
  }

  function updateRoleRow(index: number, patch: Partial<RoleRow>) {
    setRoles((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function removeRoleRow(index: number) {
    setRoles((rows) => rows.filter((_, i) => i !== index));
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setShowConfirm(true);
  }

  function handleConfirmSave() {
    setError(null);

    if (isEditing && eventId) {
      updateEvent.mutate(
        {
          id: eventId,
          input: { name, description, location, defaultStartTime, defaultDurationMinutes, timezone, recurrenceEndDate: recurrenceEndDate || null },
        },
        {
          onSuccess: () => {
            setShowConfirm(false);
            if (regenerateAfterSave) regenerate.mutate(eventId);
          },
          onError: (err) => setError(err instanceof Error ? err.message : 'Failed to save'),
        },
      );
      return;
    }

    const base = { name, description, location, defaultStartTime, defaultDurationMinutes, timezone };
    const payload = isRecurring
      ? {
          ...base,
          isRecurring: true as const,
          rrule: `FREQ=WEEKLY;BYDAY=${weekday}`,
          dtstart: new Date(`${dtstart}T00:00:00.000Z`).toISOString(),
          recurrenceEndDate: recurrenceEndDate || undefined,
          roleTemplates: roles,
        }
      : {
          ...base,
          isRecurring: false as const,
          occurrenceDate,
          roleTemplates: roles,
        };

    createEvent.mutate(payload, {
      onSuccess: (created) => {
        setShowConfirm(false);
        navigate(`/admin/events/${created.id}`);
      },
      onError: (err) => setError(err instanceof Error ? err.message : 'Failed to create event'),
    });
  }

  return (
    <div>
      <h1>{isEditing ? 'Edit Event' : 'New Event'}</h1>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxWidth: 600 }}>
        <Field label="Name">
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>
        <Field label="Description">
          <input value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <Field label="Location">
          <input value={location} onChange={(e) => setLocation(e.target.value)} />
        </Field>

        <div style={{ display: 'flex', gap: '1rem' }}>
          <Field label="Start time">
            <input type="time" value={defaultStartTime} onChange={(e) => setDefaultStartTime(e.target.value)} required />
          </Field>
          <Field label="Duration (minutes)">
            <input
              type="number"
              min={1}
              value={defaultDurationMinutes}
              onChange={(e) => setDefaultDurationMinutes(Number(e.target.value))}
              required
            />
          </Field>
          <Field label="Timezone">
            <select value={timezone} onChange={(e) => setTimezone(e.target.value)}>
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
          </Field>
        </div>

        {!isEditing && (
          <Field label="Event type">
            <div style={{ display: 'flex', gap: '1rem' }}>
              <label>
                <input type="radio" checked={!isRecurring} onChange={() => setIsRecurring(false)} /> One-off
              </label>
              <label>
                <input type="radio" checked={isRecurring} onChange={() => setIsRecurring(true)} /> Recurring
              </label>
            </div>
          </Field>
        )}

        {!isEditing && !isRecurring && (
          <Field label="Date">
            <input type="date" value={occurrenceDate} onChange={(e) => setOccurrenceDate(e.target.value)} required />
          </Field>
        )}

        {!isEditing && isRecurring && (
          <div style={{ display: 'flex', gap: '1rem' }}>
            <Field label="Repeats weekly on">
              <select value={weekday} onChange={(e) => setWeekday(e.target.value)}>
                {WEEKDAYS.map((w) => (
                  <option key={w.value} value={w.value}>
                    {w.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="First occurrence">
              <input type="date" value={dtstart} onChange={(e) => setDtstart(e.target.value)} required />
            </Field>
          </div>
        )}

        {(isRecurring || isEditing) && (
          <Field label="Recurrence end date (optional)">
            <input type="date" value={recurrenceEndDate} onChange={(e) => setRecurrenceEndDate(e.target.value)} />
          </Field>
        )}

        <div>
          <h3>Roles needed</h3>
          {(isEditing ? existingEvent?.roleTemplates ?? [] : []).map((t) => (
            <div key={t.id} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.4rem' }}>
              <span style={{ flex: 1 }}>
                {t.name} · {teams?.find((tm) => tm.id === t.teamId)?.name ?? t.teamId} · {t.slotsCount} slot(s)
                {t.stackable ? ' · stackable' : ''}
              </span>
              <button
                type="button"
                onClick={() => eventId && deleteRoleTemplate.mutate({ eventId, templateId: t.id })}
                style={{ border: 'none', background: 'transparent', color: '#999', cursor: 'pointer' }}
              >
                Remove
              </button>
            </div>
          ))}

          {roles.map((row, i) => (
            <RoleRowEditor
              key={i}
              row={row}
              teams={teams ?? []}
              onChange={(patch) => updateRoleRow(i, patch)}
              onRemove={() => removeRoleRow(i)}
            />
          ))}

          {isEditing ? (
            <AddExistingRoleForm
              teams={teams ?? []}
              onAdd={(input) => eventId && addRoleTemplate.mutate({ eventId, input })}
            />
          ) : (
            <button type="button" onClick={addRoleRow} style={{ marginTop: '0.5rem', padding: '0.4rem 0.9rem', borderRadius: 8, border: '1px solid #ccc', background: '#fff', cursor: 'pointer' }}>
              + Add role
            </button>
          )}
        </div>

        {error && !showConfirm && <p style={{ color: '#b00020' }}>{error}</p>}

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button type="submit" style={{ padding: '0.6rem 1.5rem', borderRadius: 8, border: 'none', background: '#2f6f4f', color: '#fff', cursor: 'pointer' }}>
            {isEditing ? 'Save changes' : 'Create event'}
          </button>
        </div>
      </form>

      {showConfirm && (
        <Modal title={isEditing ? 'Save changes?' : 'Create this event?'} onClose={() => setShowConfirm(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <p style={{ margin: 0 }}>
              {isEditing ? (
                <>
                  Save changes to <strong>{name}</strong>?
                </>
              ) : (
                <>
                  Create <strong>{name || 'this event'}</strong>{' '}
                  {isRecurring ? `repeating weekly on ${WEEKDAYS.find((w) => w.value === weekday)?.label}s` : `on ${occurrenceDate}`}?
                </>
              )}
            </p>

            {isEditing && existingEvent?.isRecurring && (
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', fontSize: '0.9rem' }}>
                <input
                  type="checkbox"
                  checked={regenerateAfterSave}
                  onChange={(e) => setRegenerateAfterSave(e.target.checked)}
                  style={{ marginTop: 3 }}
                />
                <span>
                  Also regenerate future occurrences now — adds any newly-valid dates and removes future,
                  unassigned occurrences that no longer match. Occurrences with existing assignments are never
                  touched.
                </span>
              </label>
            )}

            {error && <p style={{ color: '#b00020', margin: 0 }}>{error}</p>}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
              <button
                type="button"
                onClick={() => setShowConfirm(false)}
                style={{ padding: '0.5rem 1rem', borderRadius: 8, border: '1px solid #ccc', background: '#fff', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmSave}
                disabled={createEvent.isPending || updateEvent.isPending}
                style={{ padding: '0.5rem 1.25rem', borderRadius: 8, border: 'none', background: '#2f6f4f', color: '#fff', cursor: 'pointer' }}
              >
                {isEditing ? 'Save' : 'Create'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function RoleRowEditor({
  row,
  teams,
  onChange,
  onRemove,
}: {
  row: RoleRow;
  teams: { id: string; name: string }[];
  onChange: (patch: Partial<RoleRow>) => void;
  onRemove: () => void;
}) {
  return (
    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.4rem' }}>
      <select value={row.teamId} onChange={(e) => onChange({ teamId: e.target.value })}>
        {teams.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
      <input placeholder="Role name" value={row.name} onChange={(e) => onChange({ name: e.target.value })} style={{ flex: 1 }} />
      <input
        type="number"
        min={1}
        value={row.slotsCount}
        onChange={(e) => onChange({ slotsCount: Number(e.target.value) })}
        style={{ width: 60 }}
      />
      <label style={{ fontSize: '0.8rem' }}>
        <input type="checkbox" checked={row.stackable} onChange={(e) => onChange({ stackable: e.target.checked })} /> stackable
      </label>
      <button type="button" onClick={onRemove} style={{ border: 'none', background: 'transparent', color: '#999', cursor: 'pointer' }}>
        ✕
      </button>
    </div>
  );
}

function AddExistingRoleForm({
  teams,
  onAdd,
}: {
  teams: { id: string; name: string }[];
  onAdd: (input: CreateEventRoleTemplateInput) => void;
}) {
  const [row, setRow] = useState<RoleRow>({ teamId: teams[0]?.id ?? '', name: '', slotsCount: 1, stackable: false, sortOrder: 0 });
  if (teams.length === 0) return null;
  return (
    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.5rem' }}>
      <RoleRowEditor row={row} teams={teams} onChange={(patch) => setRow((r) => ({ ...r, ...patch }))} onRemove={() => setRow({ teamId: teams[0]?.id ?? '', name: '', slotsCount: 1, stackable: false, sortOrder: 0 })} />
      <button
        type="button"
        onClick={() => {
          if (!row.name) return;
          onAdd(row);
          setRow({ teamId: teams[0]?.id ?? '', name: '', slotsCount: 1, stackable: false, sortOrder: 0 });
        }}
        style={{ padding: '0.4rem 0.9rem', borderRadius: 8, border: 'none', background: '#2f6f4f', color: '#fff', cursor: 'pointer' }}
      >
        Add
      </button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.85rem', color: '#333' }}>
      {label}
      {children}
    </label>
  );
}
