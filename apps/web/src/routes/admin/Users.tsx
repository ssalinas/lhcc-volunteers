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
        className="card"
        style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: '1.5rem' }}
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
        <button type="submit" className="btn btn-primary" style={{ height: 38 }}>
          Create user
        </button>
      </form>
      {error && <p style={{ color: 'var(--color-danger)' }}>{error}</p>}

      {isLoading ? (
        <p>Loading…</p>
      ) : (
        <table className="card" style={{ width: '100%', borderCollapse: 'collapse', padding: 0, overflow: 'hidden' }}>
          <thead>
            <tr style={{ textAlign: 'left', background: 'var(--color-bg)' }}>
              <th style={{ padding: '0.7rem 0.9rem' }}>Name</th>
              <th style={{ padding: '0.7rem 0.9rem' }}>Email</th>
              <th style={{ padding: '0.7rem 0.9rem' }}>Role</th>
              <th style={{ padding: '0.7rem 0.9rem' }}>Active</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {users?.map((u) => (
              <tr key={u.id} style={{ borderTop: '1px solid var(--color-border)' }}>
                <td style={{ padding: '0.6rem 0.9rem' }}>{u.name}</td>
                <td style={{ padding: '0.6rem 0.9rem' }}>{u.email}</td>
                <td style={{ padding: '0.6rem 0.9rem' }}>
                  <select
                    value={u.role}
                    onChange={(e) => updateUser.mutate({ id: u.id, input: { role: e.target.value as UserRole } })}
                  >
                    <option value="volunteer">Volunteer</option>
                    <option value="admin">Admin</option>
                  </select>
                </td>
                <td style={{ padding: '0.6rem 0.9rem' }}>
                  <input
                    type="checkbox"
                    checked={u.active}
                    onChange={(e) => updateUser.mutate({ id: u.id, input: { active: e.target.checked } })}
                  />
                </td>
                <td style={{ padding: '0.6rem 0.9rem' }}>
                  <button
                    type="button"
                    onClick={() => setAvailabilityUserId(availabilityUserId === u.id ? null : u.id)}
                    className="btn btn-secondary btn-sm"
                    style={availabilityUserId === u.id ? { background: 'var(--color-primary-light)', color: 'var(--color-primary)', borderColor: 'var(--color-primary)' } : undefined}
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
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
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
    <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.85rem', color: 'var(--color-text-muted)', fontWeight: 500 }}>
      {label}
      {children}
    </label>
  );
}
