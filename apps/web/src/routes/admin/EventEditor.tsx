import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { addDays, format } from 'date-fns';
import type { CreateEventRoleTemplateInput } from '@lhcc/shared';
import { Modal } from '../../components/Modal.js';
import { useToast } from '../../components/Toast.js';
import { useUnsavedChangesWarning } from '../../components/useUnsavedChangesWarning.js';
import { useOccurrences, useTeams } from '../../api/hooks.js';
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

/**
 * One save model for the whole page: every change — event details, new roles, removed roles —
 * stays pending until the single Save button, and an "unsaved changes" bar + leave-page warning
 * make that state obvious. (Previously roles had their own separate Add/Remove buttons that
 * saved instantly while everything else needed Save, so a role typed in and followed by
 * "Save changes" was silently dropped.)
 */
export default function AdminEventEditor() {
  const { eventId } = useParams();
  const isEditing = !!eventId;
  const navigate = useNavigate();
  const toast = useToast();
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
  const [removedTemplateIds, setRemovedTemplateIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [showCreateConfirm, setShowCreateConfirm] = useState(false);
  const [regenerateAfterSave, setRegenerateAfterSave] = useState(false);
  const [saving, setSaving] = useState(false);

  function resetFromExisting() {
    if (!existingEvent) return;
    setName(existingEvent.name);
    setDescription(existingEvent.description ?? '');
    setLocation(existingEvent.location ?? '');
    setDefaultStartTime(existingEvent.defaultStartTime);
    setDefaultDurationMinutes(existingEvent.defaultDurationMinutes);
    setTimezone(existingEvent.timezone);
    setIsRecurring(existingEvent.isRecurring);
    setRecurrenceEndDate(existingEvent.recurrenceEndDate ?? '');
    setRoles([]);
    setRemovedTemplateIds(new Set());
    setRegenerateAfterSave(false);
    setError(null);
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(resetFromExisting, [existingEvent]);

  const dirty = isEditing
    ? !!existingEvent &&
      (name !== existingEvent.name ||
        description !== (existingEvent.description ?? '') ||
        location !== (existingEvent.location ?? '') ||
        defaultStartTime !== existingEvent.defaultStartTime ||
        defaultDurationMinutes !== existingEvent.defaultDurationMinutes ||
        timezone !== existingEvent.timezone ||
        recurrenceEndDate !== (existingEvent.recurrenceEndDate ?? '') ||
        roles.length > 0 ||
        removedTemplateIds.size > 0)
    : !!name || !!description || !!location || roles.length > 0;

  useUnsavedChangesWarning(dirty && !saving);

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

  function toggleRemoveTemplate(id: string) {
    setRemovedTemplateIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /** Blocks saving (with a clear message) instead of silently dropping a half-filled role row. */
  function validate(): boolean {
    if (roles.some((r) => !r.name.trim())) {
      setError('Each new role needs a name. Fill it in, or click ✕ to remove that row.');
      return false;
    }
    return true;
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!validate()) return;
    if (isEditing) void handleSaveEdits();
    else setShowCreateConfirm(true);
  }

  async function handleSaveEdits() {
    if (!eventId) return;
    setSaving(true);
    try {
      await updateEvent.mutateAsync({
        id: eventId,
        input: { name, description, location, defaultStartTime, defaultDurationMinutes, timezone, recurrenceEndDate: recurrenceEndDate || null },
      });
      for (const templateId of removedTemplateIds) {
        await deleteRoleTemplate.mutateAsync({ eventId, templateId });
      }
      for (const [i, row] of roles.entries()) {
        await addRoleTemplate.mutateAsync({
          eventId,
          input: { ...row, name: row.name.trim(), sortOrder: (existingEvent?.roleTemplates?.length ?? 0) + i },
        });
      }
      if (regenerateAfterSave) await regenerate.mutateAsync(eventId);
      // State resets via the useEffect once the refetched event arrives.
      toast('Saved ✓');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
      toast('Could not save — see the message on the page', { variant: 'error' });
    } finally {
      setSaving(false);
    }
  }

  function handleConfirmCreate() {
    setError(null);
    const cleanRoles = roles.map((r) => ({ ...r, name: r.name.trim() }));
    const base = { name, description, location, defaultStartTime, defaultDurationMinutes, timezone };
    const payload = isRecurring
      ? {
          ...base,
          isRecurring: true as const,
          rrule: `FREQ=WEEKLY;BYDAY=${weekday}`,
          dtstart: new Date(`${dtstart}T00:00:00.000Z`).toISOString(),
          recurrenceEndDate: recurrenceEndDate || undefined,
          roleTemplates: cleanRoles,
        }
      : {
          ...base,
          isRecurring: false as const,
          occurrenceDate,
          roleTemplates: cleanRoles,
        };

    setSaving(true);
    createEvent.mutate(payload, {
      onSuccess: (created) => {
        setShowCreateConfirm(false);
        navigate(`/admin/events/${created.id}`);
        toast(`Created "${created.name}"`, {
          action: { label: 'Schedule volunteers', onClick: () => navigate('/admin/schedule') },
        });
      },
      onError: (err) => setError(err instanceof Error ? err.message : 'Failed to create event'),
      onSettled: () => setSaving(false),
    });
  }

  const existingTemplates = isEditing ? existingEvent?.roleTemplates ?? [] : [];

  return (
    <div>
      <h1>{isEditing ? 'Edit Event' : 'New Event'}</h1>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxWidth: 640 }}>
        <Field label="Name">
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>
        <Field label="Description">
          <input value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <Field label="Location">
          <input value={location} onChange={(e) => setLocation(e.target.value)} />
        </Field>

        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
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
                <input type="radio" checked={!isRecurring} onChange={() => setIsRecurring(false)} /> One-time
              </label>
              <label>
                <input type="radio" checked={isRecurring} onChange={() => setIsRecurring(true)} /> Repeats every week
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
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <Field label="Repeats weekly on">
              <select value={weekday} onChange={(e) => setWeekday(e.target.value)}>
                {WEEKDAYS.map((w) => (
                  <option key={w.value} value={w.value}>
                    {w.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Starting from">
              <input type="date" value={dtstart} onChange={(e) => setDtstart(e.target.value)} required />
            </Field>
          </div>
        )}

        {isRecurring && (
          <Field label="Stop repeating after (optional)">
            <input type="date" value={recurrenceEndDate} onChange={(e) => setRecurrenceEndDate(e.target.value)} />
          </Field>
        )}

        <div>
          <h3 style={{ marginBottom: '0.25rem' }}>Roles needed</h3>
          <p style={{ margin: '0 0 0.75rem', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
            {isEditing
              ? 'Role changes apply to every upcoming date of this event when you save. Roles that already have someone assigned are never removed.'
              : 'The jobs that need volunteers each time, e.g. "Greeter" from the Greeters team.'}
          </p>

          {existingTemplates.map((t) => {
            const removing = removedTemplateIds.has(t.id);
            return (
              <div
                key={t.id}
                style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.4rem', opacity: removing ? 0.6 : 1 }}
              >
                <span style={{ flex: 1, textDecoration: removing ? 'line-through' : undefined }}>
                  <strong>{t.name}</strong> · {teams?.find((tm) => tm.id === t.teamId)?.name ?? t.teamId} team ·{' '}
                  {t.slotsCount} {t.slotsCount === 1 ? 'person' : 'people'}
                  {t.stackable ? ' · stackable' : ''}
                </span>
                {removing && <span className="badge badge-warning">Will be removed</span>}
                <button type="button" onClick={() => toggleRemoveTemplate(t.id)} className="btn btn-secondary btn-sm">
                  {removing ? 'Keep' : 'Remove'}
                </button>
              </div>
            );
          })}

          {roles.map((row, i) => (
            <RoleRowEditor
              key={i}
              row={row}
              teams={teams ?? []}
              isNew={isEditing}
              onChange={(patch) => updateRoleRow(i, patch)}
              onRemove={() => removeRoleRow(i)}
            />
          ))}

          <button type="button" onClick={addRoleRow} className="btn btn-secondary btn-sm" style={{ marginTop: '0.5rem' }}>
            + Add role
          </button>
        </div>

        {isEditing && existingEvent?.isRecurring && (
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', fontSize: '0.9rem' }}>
            <input
              type="checkbox"
              checked={regenerateAfterSave}
              onChange={(e) => setRegenerateAfterSave(e.target.checked)}
              style={{ marginTop: 3 }}
            />
            <span>
              When I save, also update upcoming dates to match a changed time or end date — adds any newly-valid
              dates and removes future dates that no longer fit and have nobody assigned yet.
            </span>
          </label>
        )}

        {error && !showCreateConfirm && <p style={{ color: 'var(--color-danger)', fontWeight: 600, margin: 0 }}>{error}</p>}

        {isEditing ? (
          dirty ? (
            <div className="unsaved-bar">
              <span>You have unsaved changes</span>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button type="button" onClick={resetFromExisting} disabled={saving} className="btn btn-secondary">
                  Discard
                </button>
                <button type="submit" disabled={saving} className="btn btn-primary">
                  {saving ? 'Saving…' : 'Save changes'}
                </button>
              </div>
            </div>
          ) : (
            <p style={{ color: 'var(--color-success)', fontWeight: 600, margin: 0 }}>✓ All changes saved</p>
          )
        ) : (
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button type="submit" className="btn btn-primary">
              Create event
            </button>
          </div>
        )}
      </form>

      {isEditing && eventId && <UpcomingDates eventId={eventId} />}

      {showCreateConfirm && (
        <Modal title="Create this event?" onClose={() => setShowCreateConfirm(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <p style={{ margin: 0 }}>
              Create <strong>{name || 'this event'}</strong>{' '}
              {isRecurring ? `every ${WEEKDAYS.find((w) => w.value === weekday)?.label}` : `on ${occurrenceDate}`} with{' '}
              {roles.length === 0 ? 'no roles yet' : `${roles.length} role${roles.length === 1 ? '' : 's'}`}?
            </p>

            {error && <p style={{ color: 'var(--color-danger)', margin: 0 }}>{error}</p>}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
              <button type="button" onClick={() => setShowCreateConfirm(false)} className="btn btn-secondary">
                Cancel
              </button>
              <button type="button" onClick={handleConfirmCreate} disabled={createEvent.isPending} className="btn btn-primary">
                Create
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

/** "What's next" after setting up an event: links straight to each upcoming date's scheduling page. */
function UpcomingDates({ eventId }: { eventId: string }) {
  const now = useMemo(() => new Date(), []);
  const horizon = useMemo(() => addDays(now, 120), [now]);
  const { data: occurrences } = useOccurrences(now.toISOString(), horizon.toISOString());
  const upcoming = (occurrences ?? [])
    .filter((o) => o.eventId === eventId)
    .sort((a, b) => a.startAt.localeCompare(b.startAt))
    .slice(0, 8);

  return (
    <div style={{ marginTop: '2rem', maxWidth: 640 }}>
      <h3 style={{ marginBottom: '0.25rem' }}>Upcoming dates</h3>
      <p style={{ margin: '0 0 0.75rem', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
        Click a date to assign volunteers or add a one-off role just for that day.
      </p>
      {upcoming.length === 0 && <p style={{ color: 'var(--color-text-faint)' }}>No upcoming dates.</p>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
        {upcoming.map((o) => (
          <Link
            key={o.id}
            to={`/admin/occurrences/${o.id}`}
            className="card"
            style={{ display: 'flex', justifyContent: 'space-between', padding: '0.6rem 1rem', textDecoration: 'none', color: 'inherit' }}
          >
            <span style={{ fontWeight: 600 }}>{format(new Date(o.startAt), 'EEE, MMM d · p')}</span>
            <span className={`badge ${o.totalSlots > 0 && o.filledSlots >= o.totalSlots ? 'badge-success' : 'badge-warning'}`}>
              {o.filledSlots}/{o.totalSlots} filled →
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

function RoleRowEditor({
  row,
  teams,
  isNew,
  onChange,
  onRemove,
}: {
  row: RoleRow;
  teams: { id: string; name: string }[];
  isNew?: boolean;
  onChange: (patch: Partial<RoleRow>) => void;
  onRemove: () => void;
}) {
  return (
    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.4rem', flexWrap: 'wrap' }}>
      {isNew && <span className="badge badge-warning">New</span>}
      <input
        placeholder="Role name, e.g. Greeter"
        value={row.name}
        onChange={(e) => onChange({ name: e.target.value })}
        style={{ flex: 1, minWidth: 160, borderColor: row.name.trim() ? undefined : 'var(--color-accent)' }}
        aria-label="Role name"
      />
      <select value={row.teamId} onChange={(e) => onChange({ teamId: e.target.value })} aria-label="Team">
        {teams.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
      <label style={{ fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
        People
        <input
          type="number"
          min={1}
          value={row.slotsCount}
          onChange={(e) => onChange({ slotsCount: Number(e.target.value) })}
          style={{ width: 60 }}
        />
      </label>
      <label style={{ fontSize: '0.8rem' }}>
        <input type="checkbox" checked={row.stackable} onChange={(e) => onChange({ stackable: e.target.checked })} /> stackable
      </label>
      <button type="button" onClick={onRemove} className="btn-ghost" aria-label="Remove this role row">
        ✕
      </button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.85rem', color: 'var(--color-text-muted)', fontWeight: 500 }}>
      {label}
      {children}
    </label>
  );
}
