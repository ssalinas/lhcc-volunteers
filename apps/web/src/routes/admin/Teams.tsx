import { useState, type FormEvent } from 'react';
import { Modal } from '../../components/Modal.js';
import {
  useAdminUsers,
  useCreateTeam,
  useJoinTeam,
  useLeaveTeam,
  useTeamMembers,
  useTeams,
} from '../../api/hooks.js';

export default function AdminTeams() {
  const { data: teams } = useTeams();
  const [selectedTeamId, setSelectedTeamId] = useState<string | undefined>(undefined);
  const [showCreateModal, setShowCreateModal] = useState(false);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h1 style={{ margin: 0 }}>Manage Teams</h1>
        <button type="button" onClick={() => setShowCreateModal(true)} className="btn btn-primary">
          + New team
        </button>
      </div>

      {showCreateModal && <CreateTeamModal onClose={() => setShowCreateModal(false)} />}

      <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
        <div style={{ minWidth: 220 }}>
          {teams?.map((team) => (
            <button
              key={team.id}
              type="button"
              onClick={() => setSelectedTeamId(team.id)}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '0.6rem 0.75rem',
                marginBottom: '0.4rem',
                borderRadius: 'var(--radius-sm)',
                border: `1px solid ${selectedTeamId === team.id ? 'var(--color-primary)' : 'var(--color-border)'}`,
                background: selectedTeamId === team.id ? 'var(--color-primary-light)' : 'var(--color-surface)',
                color: selectedTeamId === team.id ? 'var(--color-primary)' : 'var(--color-text)',
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {team.name} <span style={{ color: 'var(--color-text-faint)', fontSize: '0.8rem' }}>({team.memberCount})</span>
              {team.isSystemTeam && (
                <span style={{ display: 'block', color: '#9a6b00', fontSize: '0.7rem', fontWeight: 600 }}>auto · everyone</span>
              )}
            </button>
          ))}
        </div>

        <div style={{ flex: 1, minWidth: 280 }}>
          {selectedTeamId ? (
            <TeamMembersPanel teamId={selectedTeamId} isSystemTeam={teams?.find((t) => t.id === selectedTeamId)?.isSystemTeam ?? false} />
          ) : (
            <p>Select a team to manage its members.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function CreateTeamModal({ onClose }: { onClose: () => void }) {
  const createTeam = useCreateTeam();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);

  function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    createTeam.mutate(
      { name, description: description || undefined },
      {
        onSuccess: () => onClose(),
        onError: (err) => setError(err instanceof Error ? err.message : 'Failed to create team'),
      },
    );
  }

  return (
    <Modal title="New team" onClose={onClose}>
      <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.85rem' }}>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.85rem' }}>
          Description
          <input value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>
        {error && <p style={{ color: 'var(--color-danger)', fontSize: '0.85rem', margin: 0 }}>{error}</p>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
          <button type="button" onClick={onClose} className="btn btn-secondary">
            Cancel
          </button>
          <button type="submit" disabled={createTeam.isPending} className="btn btn-primary">
            Create team
          </button>
        </div>
      </form>
    </Modal>
  );
}

function TeamMembersPanel({ teamId, isSystemTeam }: { teamId: string; isSystemTeam: boolean }) {
  const { data: members } = useTeamMembers(teamId);
  const { data: users } = useAdminUsers();
  const join = useJoinTeam();
  const leave = useLeaveTeam();
  const [addUserId, setAddUserId] = useState('');

  const memberIds = new Set((members ?? []).map((m) => m.userId));
  const addableUsers = (users ?? []).filter((u) => !memberIds.has(u.id));

  return (
    <div>
      <h3 style={{ marginTop: 0 }}>Members</h3>
      {isSystemTeam && (
        <p style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
          This team automatically includes every active volunteer — membership can't be edited here.
        </p>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '1rem' }}>
        {members?.map((m) => (
          <div key={m.userId} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.75rem' }}>
            <span>
              {m.user.name} <span style={{ color: 'var(--color-text-faint)', fontSize: '0.8rem' }}>{m.user.email}</span>
            </span>
            {!isSystemTeam && (
              <button type="button" onClick={() => leave.mutate({ teamId, userId: m.userId })} className="btn-ghost">
                Remove
              </button>
            )}
          </div>
        ))}
        {members?.length === 0 && <p style={{ color: 'var(--color-text-faint)' }}>No members yet.</p>}
      </div>

      {!isSystemTeam && (
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <select value={addUserId} onChange={(e) => setAddUserId(e.target.value)} style={{ flex: 1 }}>
            <option value="">Add a user…</option>
            {addableUsers.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} ({u.email})
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={!addUserId}
            onClick={() => {
              join.mutate({ teamId, userId: addUserId });
              setAddUserId('');
            }}
            className="btn btn-primary btn-sm"
          >
            Add
          </button>
        </div>
      )}
    </div>
  );
}
