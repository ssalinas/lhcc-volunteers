import { useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { format } from 'date-fns';
import type { AssignmentStatus } from '@lhcc/shared';
import { useAdminUsers, useTeams } from '../../api/hooks.js';
import {
  useAddAdHocRole,
  useAutoSchedule,
  useCreateAssignment,
  useDeleteAssignment,
  useEligibleCandidates,
  useOccurrence,
  useUpdateAssignment,
} from '../../api/hooks.js';
import { ApiError } from '../../api/client.js';
import { useToast } from '../../components/Toast.js';
import { useUnsavedChangesWarning } from '../../components/useUnsavedChangesWarning.js';

export default function AdminOccurrenceDetail() {
  const { occurrenceId } = useParams();
  const { data: occurrence, isLoading } = useOccurrence(occurrenceId);
  const autoSchedule = useAutoSchedule();
  const [autoScheduleMessage, setAutoScheduleMessage] = useState<string | null>(null);

  if (isLoading || !occurrence) return <p>Loading…</p>;

  function handleAutoSchedule() {
    if (!occurrenceId) return;
    setAutoScheduleMessage(null);
    autoSchedule.mutate(occurrenceId, {
      onSuccess: (result) => {
        const filled = result.createdAssignments.length;
        const gaps = result.gaps.length;
        setAutoScheduleMessage(
          gaps === 0
            ? `Filled ${filled} slot(s). Everything is staffed.`
            : `Filled ${filled} slot(s). ${gaps} slot(s) still need attention: ${result.gaps
                .map((g) => `${g.roleName} (${g.slotsFilled}/${g.slotsNeeded})`)
                .join(', ')}.`,
        );
      },
    });
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ marginBottom: 0 }}>{occurrence.eventName}</h1>
          <p style={{ color: 'var(--color-text-muted)', marginTop: '0.25rem' }}>
            {format(new Date(occurrence.startAt), 'PPPP p')} · {occurrence.location ?? 'No location set'}
          </p>
        </div>
        <button type="button" onClick={handleAutoSchedule} disabled={autoSchedule.isPending} className="btn btn-primary">
          {autoSchedule.isPending ? 'Scheduling…' : 'Auto-schedule'}
        </button>
      </div>
      {autoScheduleMessage && (
        <div className="card" style={{ padding: '0.75rem 1rem', marginTop: '1rem', fontSize: '0.9rem', background: 'var(--color-primary-light)', boxShadow: 'none' }}>
          {autoScheduleMessage}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1.5rem' }}>
        {occurrence.roles.map((role) => (
          <RoleCard key={role.id} occurrenceId={occurrence.id} role={role} />
        ))}
        {occurrence.roles.length === 0 && <p>No roles configured for this occurrence yet.</p>}
      </div>

      <AddRoleForm occurrenceId={occurrence.id} />
    </div>
  );
}

function RoleCard({
  occurrenceId,
  role,
}: {
  occurrenceId: string;
  role: NonNullable<ReturnType<typeof useOccurrence>['data']>['roles'][number];
}) {
  const deleteAssignment = useDeleteAssignment();
  const createAssignment = useCreateAssignment();
  const updateAssignment = useUpdateAssignment();
  const toast = useToast();
  const activeAssignments = role.assignments.filter((a) => a.status !== 'declined');
  const isFull = activeAssignments.length >= role.slotsCount;
  const isOverStaffed = activeAssignments.length > role.slotsCount;

  function handleRemove(a: (typeof role.assignments)[number]) {
    const name = a.user?.name ?? 'Volunteer';
    deleteAssignment.mutate(
      { id: a.id, occurrenceId },
      {
        onSuccess: () =>
          toast(`Removed ${name} from ${role.name}`, {
            action: {
              label: 'Undo',
              // force: the original assignment already passed (or overrode) the eligibility
              // checks, so putting it back shouldn't re-prompt.
              onClick: () =>
                createAssignment.mutate(
                  { occurrenceId, input: { volunteerRoleId: role.id, userId: a.userId, force: true } },
                  {
                    onSuccess: (restored) => {
                      if (a.status !== 'scheduled') {
                        updateAssignment.mutate({ id: restored.id, occurrenceId, input: { status: a.status } });
                      }
                    },
                    onError: (err) => toast(errorMessage(err, 'Could not undo'), { variant: 'error' }),
                  },
                ),
            },
          }),
        onError: (err) => toast(errorMessage(err, 'Could not remove'), { variant: 'error' }),
      },
    );
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <strong>
          {role.name}{' '}
          {role.stackable && <span style={{ fontWeight: 400, color: 'var(--color-text-faint)', fontSize: '0.8rem' }}>(stackable)</span>}
        </strong>
        <span className={`badge ${isFull ? 'badge-success' : 'badge-warning'}`}>
          {activeAssignments.length}/{role.slotsCount} filled{isOverStaffed ? ' (extra added)' : ''}
        </span>
      </div>
      <div style={{ marginTop: '0.6rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
        {role.assignments.map((a) => (
          <div key={a.id} style={{ fontSize: '0.9rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>
              {a.user?.name ?? a.userId} <StatusBadge status={a.status} />
            </span>
            <button type="button" onClick={() => handleRemove(a)} className="btn-ghost" style={{ fontSize: '0.8rem' }}>
              Remove
            </button>
          </div>
        ))}
        {role.assignments.length === 0 && <span style={{ color: 'var(--color-text-faint)', fontSize: '0.85rem' }}>No one assigned yet.</span>}
      </div>

      <AssignPicker occurrenceId={occurrenceId} roleId={role.id} roleName={role.name} addingExtra={isFull} />
    </div>
  );
}

function errorMessage(err: unknown, fallback: string) {
  return err instanceof Error && err.message ? err.message : fallback;
}

function StatusBadge({ status }: { status: AssignmentStatus }) {
  const colors: Record<AssignmentStatus, string> = {
    scheduled: '#9a6b00',
    confirmed: 'var(--color-success)',
    declined: 'var(--color-danger)',
    completed: 'var(--color-text-faint)',
  };
  return <span style={{ color: colors[status], fontSize: '0.75rem' }}>({status})</span>;
}

/**
 * Picking a name assigns them immediately — there's deliberately no separate "Assign" button,
 * because admins kept choosing someone and navigating away without clicking it. The toast's
 * Undo is the safety net for a mis-pick.
 */
function AssignPicker({
  occurrenceId,
  roleId,
  roleName,
  addingExtra,
}: {
  occurrenceId: string;
  roleId: string;
  roleName: string;
  addingExtra?: boolean;
}) {
  const { data: candidates } = useEligibleCandidates(occurrenceId, roleId);
  const { data: allUsers } = useAdminUsers();
  const createAssignment = useCreateAssignment();
  const deleteAssignment = useDeleteAssignment();
  const toast = useToast();

  const candidateIds = new Set((candidates ?? []).map((c) => c.userId));
  const otherActiveUsers = (allUsers ?? [])
    .filter((u) => u.active && !candidateIds.has(u.id))
    .sort((a, b) => a.name.localeCompare(b.name));

  function nameFor(userId: string) {
    return candidates?.find((c) => c.userId === userId)?.name ?? allUsers?.find((u) => u.id === userId)?.name ?? 'Volunteer';
  }

  function assign(userId: string, force = false) {
    createAssignment.mutate(
      { occurrenceId, input: { volunteerRoleId: roleId, userId, force } },
      {
        onSuccess: (created) =>
          toast(`${nameFor(userId)} assigned to ${roleName}`, {
            action: { label: 'Undo', onClick: () => deleteAssignment.mutate({ id: created.id, occurrenceId }) },
          }),
        onError: (err) => {
          if (err instanceof ApiError && err.status === 409 && !force) {
            if (confirm(`${err.message}\n\nAssign ${nameFor(userId)} anyway?`)) assign(userId, true);
            return;
          }
          toast(errorMessage(err, 'Failed to assign'), { variant: 'error' });
        },
      },
    );
  }

  return (
    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem', alignItems: 'center' }}>
      {addingExtra && (
        <span style={{ fontSize: '0.75rem', color: '#9a6b00', whiteSpace: 'nowrap', fontWeight: 600 }}>Add extra:</span>
      )}
      <select
        value=""
        disabled={createAssignment.isPending}
        onChange={(e) => e.target.value && assign(e.target.value)}
        style={{ flex: 1 }}
        aria-label={`Assign someone to ${roleName}`}
      >
        <option value="">{createAssignment.isPending ? 'Saving…' : '+ Assign a volunteer (saves right away)'}</option>
        {candidates && candidates.length > 0 && (
          <optgroup label="On this team">
            {candidates.map((c) => (
              <option key={c.userId} value={c.userId}>
                {c.name} {c.available ? '' : '(unavailable)'} {c.alreadyUsedInOccurrence ? '(already serving)' : ''} · served{' '}
                {c.assignmentCountInWindow}x recently
              </option>
            ))}
          </optgroup>
        )}
        {otherActiveUsers.length > 0 && (
          <optgroup label="Not on this team (override)">
            {otherActiveUsers.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </optgroup>
        )}
      </select>
    </div>
  );
}

function AddRoleForm({ occurrenceId }: { occurrenceId: string }) {
  const { data: teams } = useTeams();
  const addRole = useAddAdHocRole();
  const toast = useToast();
  const [name, setName] = useState('');
  const [teamId, setTeamId] = useState('');
  const [slotsCount, setSlotsCount] = useState(1);
  const [stackable, setStackable] = useState(false);

  // A typed-but-not-added role name is the one piece of unsaved state left on this page.
  useUnsavedChangesWarning(name.trim().length > 0);

  const effectiveTeamId = teamId || teams?.[0]?.id || '';

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || !effectiveTeamId) return;
    const roleName = name.trim();
    addRole.mutate(
      { occurrenceId, input: { teamId: effectiveTeamId, name: roleName, slotsCount, stackable } },
      {
        onSuccess: () => {
          setName('');
          toast(`Added the "${roleName}" role`);
        },
        onError: (err) => toast(errorMessage(err, 'Could not add role'), { variant: 'error' }),
      },
    );
  }

  return (
    <form onSubmit={handleSubmit} className="card" style={{ marginTop: '1.5rem' }}>
      <h3 style={{ marginTop: 0 }}>Add a role to this occurrence</h3>
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <select value={effectiveTeamId} onChange={(e) => setTeamId(e.target.value)} aria-label="Team">
          {teams?.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <input placeholder="Role name" value={name} onChange={(e) => setName(e.target.value)} />
        <label style={{ fontSize: '0.85rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
          People needed
          <input type="number" min={1} value={slotsCount} onChange={(e) => setSlotsCount(Number(e.target.value))} style={{ width: 60 }} />
        </label>
        <label style={{ fontSize: '0.85rem' }}>
          <input type="checkbox" checked={stackable} onChange={(e) => setStackable(e.target.checked)} /> stackable
        </label>
        <button type="submit" disabled={!name.trim() || !effectiveTeamId || addRole.isPending} className="btn btn-primary btn-sm">
          Add role
        </button>
      </div>
      {name.trim() && (
        <p style={{ margin: '0.6rem 0 0', fontSize: '0.85rem', color: '#9a6b00', fontWeight: 600 }}>
          Not added yet — click "Add role" (or press Enter) to save it.
        </p>
      )}
    </form>
  );
}
