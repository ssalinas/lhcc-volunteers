import { useState, type FormEvent } from 'react';
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
  const createTeam = useCreateTeam();
  const [selectedTeamId, setSelectedTeamId] = useState<string | undefined>(undefined);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  function handleCreate(e: FormEvent) {
    e.preventDefault();
    createTeam.mutate(
      { name, description: description || undefined },
      { onSuccess: () => { setName(''); setDescription(''); } },
    );
  }

  return (
    <div>
      <h1>Manage Teams</h1>

      <form
        onSubmit={handleCreate}
        style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: '1.5rem', background: '#fff', padding: '1rem', borderRadius: 10, boxShadow: '0 1px 2px rgba(0,0,0,0.08)' }}
      >
        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.85rem' }}>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.85rem' }}>
          Description
          <input value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>
        <button type="submit" style={{ padding: '0.5rem 1.25rem', borderRadius: 8, border: 'none', background: '#2f6f4f', color: '#fff', cursor: 'pointer', height: 38 }}>
          Create team
        </button>
      </form>

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
                borderRadius: 8,
                border: '1px solid #ddd',
                background: selectedTeamId === team.id ? '#e6f0ea' : '#fff',
                cursor: 'pointer',
              }}
            >
              {team.name} <span style={{ color: '#999', fontSize: '0.8rem' }}>({team.memberCount})</span>
            </button>
          ))}
        </div>

        <div style={{ flex: 1, minWidth: 280 }}>
          {selectedTeamId ? <TeamMembersPanel teamId={selectedTeamId} /> : <p>Select a team to manage its members.</p>}
        </div>
      </div>
    </div>
  );
}

function TeamMembersPanel({ teamId }: { teamId: string }) {
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '1rem' }}>
        {members?.map((m) => (
          <div key={m.userId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.75rem', background: '#fff', borderRadius: 8, boxShadow: '0 1px 2px rgba(0,0,0,0.06)' }}>
            <span>
              {m.user.name} <span style={{ color: '#999', fontSize: '0.8rem' }}>{m.user.email}</span>
            </span>
            <button
              type="button"
              onClick={() => leave.mutate({ teamId, userId: m.userId })}
              style={{ border: 'none', background: 'transparent', color: '#999', cursor: 'pointer' }}
            >
              Remove
            </button>
          </div>
        ))}
        {members?.length === 0 && <p style={{ color: '#999' }}>No members yet.</p>}
      </div>

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
          style={{ padding: '0.5rem 1rem', borderRadius: 8, border: 'none', background: '#2f6f4f', color: '#fff', cursor: 'pointer' }}
        >
          Add
        </button>
      </div>
    </div>
  );
}
