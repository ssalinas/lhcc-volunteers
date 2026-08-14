import { useState, type FormEvent } from 'react';
import type { UserRole } from '@lhcc/shared';
import { AvailabilityDateList } from '../../components/AvailabilityDateList.js';
import { useAdminUsers, useCreateUser, useUpdateUser } from '../../api/hooks.js';

export default function AdminUsers() {
  const { data: users, isLoading } = useAdminUsers();
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const [availabilityUserId, setAvailabilityUserId] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<UserRole>('volunteer');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    createUser.mutate(
      { name, email, role, password: password || undefined },
      {
        onSuccess: () => {
          setName('');
          setEmail('');
          setPassword('');
          setRole('volunteer');
        },
        onError: (err) => setError(err instanceof Error ? err.message : 'Failed to create user'),
      },
    );
  }

  return (
    <div>
      <h1>Users</h1>
      <p>
        Create an account here to invite someone. If you set a temporary password they can sign in with it directly;
        otherwise they can sign in with Google using this exact email address once we have Google sign-in configured.
      </p>

      <form
        onSubmit={handleCreate}
        style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: '1.5rem', background: '#fff', padding: '1rem', borderRadius: 10, boxShadow: '0 1px 2px rgba(0,0,0,0.08)' }}
      >
        <Field label="Name">
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>
        <Field label="Email">
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </Field>
        <Field label="Role">
          <select value={role} onChange={(e) => setRole(e.target.value as UserRole)}>
            <option value="volunteer">Volunteer</option>
            <option value="admin">Admin</option>
          </select>
        </Field>
        <Field label="Temp password (optional)">
          <input type="text" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="leave blank for Google-only" />
        </Field>
        <button type="submit" style={{ padding: '0.5rem 1.25rem', borderRadius: 8, border: 'none', background: '#2f6f4f', color: '#fff', cursor: 'pointer', height: 38 }}>
          Create user
        </button>
      </form>
      {error && <p style={{ color: '#b00020' }}>{error}</p>}

      {isLoading ? (
        <p>Loading…</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff', borderRadius: 10, overflow: 'hidden', boxShadow: '0 1px 2px rgba(0,0,0,0.08)' }}>
          <thead>
            <tr style={{ textAlign: 'left', background: '#f0f0f0' }}>
              <th style={{ padding: '0.6rem 0.75rem' }}>Name</th>
              <th style={{ padding: '0.6rem 0.75rem' }}>Email</th>
              <th style={{ padding: '0.6rem 0.75rem' }}>Role</th>
              <th style={{ padding: '0.6rem 0.75rem' }}>Active</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {users?.map((u) => (
              <tr key={u.id} style={{ borderTop: '1px solid #eee' }}>
                <td style={{ padding: '0.6rem 0.75rem' }}>{u.name}</td>
                <td style={{ padding: '0.6rem 0.75rem' }}>{u.email}</td>
                <td style={{ padding: '0.6rem 0.75rem' }}>
                  <select
                    value={u.role}
                    onChange={(e) => updateUser.mutate({ id: u.id, input: { role: e.target.value as UserRole } })}
                  >
                    <option value="volunteer">Volunteer</option>
                    <option value="admin">Admin</option>
                  </select>
                </td>
                <td style={{ padding: '0.6rem 0.75rem' }}>
                  <input
                    type="checkbox"
                    checked={u.active}
                    onChange={(e) => updateUser.mutate({ id: u.id, input: { active: e.target.checked } })}
                  />
                </td>
                <td style={{ padding: '0.6rem 0.75rem' }}>
                  <button
                    type="button"
                    onClick={() => setAvailabilityUserId(availabilityUserId === u.id ? null : u.id)}
                    style={{ padding: '0.3rem 0.75rem', borderRadius: 6, border: '1px solid #ccc', background: availabilityUserId === u.id ? '#e6f0ea' : '#fff', cursor: 'pointer', fontSize: '0.85rem' }}
                  >
                    {availabilityUserId === u.id ? 'Hide availability' : 'Edit availability'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {availabilityUserId && (
        <div style={{ marginTop: '1.5rem' }}>
          <h2>{users?.find((u) => u.id === availabilityUserId)?.name}'s availability</h2>
          <p style={{ color: '#666', fontSize: '0.9rem' }}>
            Useful for volunteers who forgot to respond or aren't comfortable using the app themselves.
          </p>
          <AvailabilityDateList userId={availabilityUserId} />
        </div>
      )}
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
