import { useState, type FormEvent } from 'react';
import { format } from 'date-fns';
import type { UserRole, UserSummary } from '@lhcc/shared';
import { AvailabilityDateList } from '../../components/AvailabilityDateList.js';
import { Modal } from '../../components/Modal.js';
import { useToast } from '../../components/Toast.js';
import { useAdminUsers, useCreateUser, useDeleteUser, useSendWelcomeEmail, useUpdateUser } from '../../api/hooks.js';

export default function AdminUsers() {
  const { data: users, isLoading } = useAdminUsers();
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const deleteUser = useDeleteUser();
  const [availabilityUserId, setAvailabilityUserId] = useState<string | null>(null);
  const [welcomeFor, setWelcomeFor] = useState<UserSummary | null>(null);
  const toast = useToast();
  const [deleteError, setDeleteError] = useState<string | null>(null);

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
        onSuccess: (created) => {
          toast(`Created ${created.name}`, {
            action: { label: 'Send welcome email', onClick: () => setWelcomeFor(created) },
            duration: 12000,
          });
          setName('');
          setEmail('');
          setPassword('');
          setRole('volunteer');
        },
        onError: (err) => setError(err instanceof Error ? err.message : 'Failed to create user'),
      },
    );
  }

  function handleDelete(id: string, name: string) {
    if (
      !confirm(
        `Delete ${name}? This permanently removes their account and all their assignment/availability history. This can't be undone.`,
      )
    ) {
      return;
    }
    setDeleteError(null);
    deleteUser.mutate(id, {
      onError: (err) => setDeleteError(err instanceof Error ? err.message : 'Failed to delete user'),
    });
  }

  return (
    <div>
      <h1>Users</h1>
      <p>
        Add someone here, then click <strong>Send welcome email</strong> — it explains the app and gives them a button
        to answer which dates they can serve. Nobody needs a password: they sign in by typing their email and tapping
        the link we email them. (A temporary password is optional, for anyone who prefers one.) Anyone who signs in
        with Google without being added here first starts out inactive — check "Active" for them below.
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
      {deleteError && <p style={{ color: 'var(--color-danger)' }}>{deleteError}</p>}

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
              <th style={{ padding: '0.7rem 0.9rem' }}>Reminder emails</th>
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
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                    <input
                      type="checkbox"
                      checked={u.active}
                      onChange={(e) => updateUser.mutate({ id: u.id, input: { active: e.target.checked } })}
                    />
                    {!u.active && <span className="badge badge-warning">Pending approval</span>}
                  </label>
                </td>
                <td style={{ padding: '0.6rem 0.9rem' }}>
                  <input
                    type="checkbox"
                    checked={u.receiveAvailabilityReminders}
                    onChange={(e) =>
                      updateUser.mutate({ id: u.id, input: { receiveAvailabilityReminders: e.target.checked } })
                    }
                  />
                </td>
                <td style={{ padding: '0.6rem 0.9rem' }}>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => setWelcomeFor(u)}
                      disabled={!u.active}
                      title={u.active ? undefined : 'Check "Active" first'}
                      className="btn btn-secondary btn-sm"
                    >
                      {u.welcomeEmailSentAt ? 'Resend welcome' : 'Send welcome email'}
                    </button>
                    {u.welcomeEmailSentAt && (
                      <span style={{ fontSize: '0.75rem', color: 'var(--color-text-faint)', whiteSpace: 'nowrap' }}>
                        sent {format(new Date(u.welcomeEmailSentAt), 'MMM d')}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => setAvailabilityUserId(availabilityUserId === u.id ? null : u.id)}
                      className="btn btn-secondary btn-sm"
                      style={availabilityUserId === u.id ? { background: 'var(--color-primary-light)', color: 'var(--color-primary)', borderColor: 'var(--color-primary)' } : undefined}
                    >
                      {availabilityUserId === u.id ? 'Hide availability' : 'Edit availability'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(u.id, u.name)}
                      disabled={deleteUser.isPending}
                      className="btn btn-danger btn-sm"
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {welcomeFor && <SendWelcomeModal user={welcomeFor} onClose={() => setWelcomeFor(null)} />}

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

function SendWelcomeModal({ user, onClose }: { user: UserSummary; onClose: () => void }) {
  const send = useSendWelcomeEmail();
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);

  return (
    <Modal title="Send welcome email?" onClose={onClose}>
      <p style={{ marginTop: 0 }}>
        Email <strong>{user.name}</strong> ({user.email}) a welcome message that explains the volunteer app, with a
        button to tell us which dates they can serve and simple no-password sign-in steps.
      </p>
      {user.welcomeEmailSentAt && (
        <p style={{ color: '#9a6b00', fontSize: '0.9rem' }}>
          They were already sent one on {format(new Date(user.welcomeEmailSentAt), 'MMM d, yyyy')}.
        </p>
      )}
      {error && <p style={{ color: 'var(--color-danger)' }}>{error}</p>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem' }}>
        <button type="button" onClick={onClose} className="btn btn-secondary">
          Cancel
        </button>
        <button
          type="button"
          disabled={send.isPending}
          onClick={() =>
            send.mutate(user.id, {
              onSuccess: () => {
                toast(`Welcome email sent to ${user.name}`);
                onClose();
              },
              onError: (err) => setError(err instanceof Error ? err.message : 'Could not send'),
            })
          }
          className="btn btn-primary"
        >
          {send.isPending ? 'Sending…' : 'Send it'}
        </button>
      </div>
    </Modal>
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
