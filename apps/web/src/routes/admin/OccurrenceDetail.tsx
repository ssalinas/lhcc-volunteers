import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { format } from 'date-fns';
import type { AssignmentStatus } from '@lhcc/shared';
import { useTeams } from '../../api/hooks.js';
import {
  useAddAdHocRole,
  useAutoSchedule,
  useCreateAssignment,
  useDeleteAssignment,
  useEligibleCandidates,
  useOccurrence,
} from '../../api/hooks.js';
import { ApiError } from '../../api/client.js';

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
  const activeAssignments = role.assignments.filter((a) => a.status !== 'declined');
  const isFull = activeAssignments.length >= role.slotsCount;
  const isOverStaffed = activeAssignments.length > role.slotsCount;

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
            <button type="button" onClick={() => deleteAssignment.mutate({ id: a.id, occurrenceId })} className="btn-ghost" style={{ fontSize: '0.8rem' }}>
              Remove
            </button>
          </div>
        ))}
        {role.assignments.length === 0 && <span style={{ color: 'var(--color-text-faint)', fontSize: '0.85rem' }}>No one assigned yet.</span>}
      </div>

      <AssignPicker occurrenceId={occurrenceId} roleId={role.id} addingExtra={isFull} />
    </div>
  );
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

function AssignPicker({
  occurrenceId,
  roleId,
  addingExtra,
}: {
  occurrenceId: string;
  roleId: string;
  addingExtra?: boolean;
}) {
  const { data: candidates } = useEligibleCandidates(occurrenceId, roleId);
  const createAssignment = useCreateAssignment();
  const [selected, setSelected] = useState('');
  const [error, setError] = useState<string | null>(null);

  function handleAssign(force = false) {
    if (!selected) return;
    setError(null);
    createAssignment.mutate(
      { occurrenceId, input: { volunteerRoleId: roleId, userId: selected, force } },
      {
        onSuccess: () => setSelected(''),
        onError: (err) => {
          if (err instanceof ApiError && err.status === 409 && !force) {
            if (confirm(`${err.message}\n\nAssign anyway?`)) {
              handleAssign(true);
              return;
            }
          }
          setError(err instanceof Error ? err.message : 'Failed to assign');
        },
      },
    );
  }

  return (
    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem', alignItems: 'center' }}>
      {addingExtra && (
        <span style={{ fontSize: '0.75rem', color: '#9a6b00', whiteSpace: 'nowrap', fontWeight: 600 }}>Add extra:</span>
      )}
      <select value={selected} onChange={(e) => setSelected(e.target.value)} style={{ flex: 1 }}>
        <option value="">Assign a volunteer…</option>
        {candidates?.map((c) => (
          <option key={c.userId} value={c.userId}>
            {c.name} {c.available ? '' : '(unavailable)'} {c.alreadyUsedInOccurrence ? '(already serving)' : ''} · served{' '}
            {c.assignmentCountInWindow}x recently
          </option>
        ))}
      </select>
      <button type="button" disabled={!selected || createAssignment.isPending} onClick={() => handleAssign(false)} className="btn btn-primary btn-sm">
        Assign
      </button>
      {error && <span style={{ color: 'var(--color-danger)', fontSize: '0.8rem' }}>{error}</span>}
    </div>
  );
}

function AddRoleForm({ occurrenceId }: { occurrenceId: string }) {
  const { data: teams } = useTeams();
  const addRole = useAddAdHocRole();
  const [name, setName] = useState('');
  const [teamId, setTeamId] = useState('');
  const [slotsCount, setSlotsCount] = useState(1);
  const [stackable, setStackable] = useState(false);

  const effectiveTeamId = teamId || teams?.[0]?.id || '';

  return (
    <div className="card" style={{ marginTop: '1.5rem' }}>
      <h3 style={{ marginTop: 0 }}>Add a role to this occurrence</h3>
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <select value={effectiveTeamId} onChange={(e) => setTeamId(e.target.value)}>
          {teams?.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <input placeholder="Role name" value={name} onChange={(e) => setName(e.target.value)} />
        <input type="number" min={1} value={slotsCount} onChange={(e) => setSlotsCount(Number(e.target.value))} style={{ width: 60 }} />
        <label style={{ fontSize: '0.85rem' }}>
          <input type="checkbox" checked={stackable} onChange={(e) => setStackable(e.target.checked)} /> stackable
        </label>
        <button
          type="button"
          disabled={!name || !effectiveTeamId}
          onClick={() => {
            addRole.mutate({ occurrenceId, input: { teamId: effectiveTeamId, name, slotsCount, stackable } });
            setName('');
          }}
          className="btn btn-primary btn-sm"
        >
          Add role
        </button>
      </div>
    </div>
  );
}
