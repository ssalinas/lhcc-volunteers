import { useSession } from '../auth/client.js';
import { useJoinTeam, useLeaveTeam, useTeams } from '../api/hooks.js';

export default function Teams() {
  const { data: session } = useSession();
  const { data: teams, isLoading } = useTeams();
  const join = useJoinTeam();
  const leave = useLeaveTeam();

  if (isLoading) return <p>Loading teams…</p>;

  const joinableTeams = teams?.filter((t) => !t.isSystemTeam);

  return (
    <div>
      <h1>Teams</h1>
      <p>Join the teams you volunteer with. You'll only be considered for scheduling on teams you belong to.</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '1.5rem' }}>
        {joinableTeams?.map((team) => (
          <div
            key={team.id}
            className="card card-hover"
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div>
              <div style={{ fontWeight: 600 }}>{team.name}</div>
              {team.description && <div style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>{team.description}</div>}
              <div style={{ color: 'var(--color-text-faint)', fontSize: '0.8rem' }}>{team.memberCount} member(s)</div>
            </div>
            {team.isMember ? (
              <button
                type="button"
                onClick={() => session && leave.mutate({ teamId: team.id, userId: session.user.id })}
                disabled={leave.isPending}
                className="btn btn-secondary"
              >
                Leave
              </button>
            ) : (
              <button type="button" onClick={() => join.mutate({ teamId: team.id })} disabled={join.isPending} className="btn btn-primary">
                Join
              </button>
            )}
          </div>
        ))}
        {joinableTeams?.length === 0 && <p>No teams have been created yet — check back soon.</p>}
      </div>
    </div>
  );
}
