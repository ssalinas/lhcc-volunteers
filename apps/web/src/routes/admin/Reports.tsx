import { useMemo, useState } from 'react';
import { addWeeks, format, formatDistanceToNow } from 'date-fns';
import { StackedBarChart, type StackedBarDatum } from '../../components/StackedBarChart.js';
import {
  useBackupStatus,
  useCoverageReport,
  useTeamSummaryReport,
  useTriggerBackup,
  useVolunteerHistoryReport,
} from '../../api/hooks.js';

const COLORS = ['#0a7dcd', '#e6a100', '#2e7d5b', '#6bb0e8', '#c0392b'];

export default function AdminReports() {
  const { data: history, isLoading: historyLoading } = useVolunteerHistoryReport();
  const { data: teamSummary, isLoading: summaryLoading } = useTeamSummaryReport(8);

  const now = useMemo(() => new Date(), []);
  const horizon = useMemo(() => addWeeks(now, 8), [now]);
  const { data: gaps } = useCoverageReport(now.toISOString(), horizon.toISOString());

  const teamNames = useMemo(() => [...new Set((history ?? []).map((h) => h.teamName))], [history]);

  const chartData: StackedBarDatum[] = useMemo(() => {
    if (!history) return [];
    const byUser = new Map<string, StackedBarDatum>();
    for (const entry of history) {
      const row = byUser.get(entry.userId) ?? { name: entry.userName, segments: [] };
      row.segments.push({
        label: entry.teamName,
        value: entry.totalAssignments,
        color: COLORS[teamNames.indexOf(entry.teamName) % COLORS.length],
      });
      byUser.set(entry.userId, row);
    }
    return [...byUser.values()];
  }, [history, teamNames]);

  return (
    <div>
      <h1>Reports</h1>

      <section style={{ marginBottom: '2rem' }}>
        <h2>Backups</h2>
        <BackupsCard />
      </section>

      <section style={{ marginBottom: '2rem' }}>
        <h2>Team activity (last 8 weeks)</h2>
        {summaryLoading ? (
          <p>Loading…</p>
        ) : (
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            {teamSummary?.map((t) => (
              <div key={t.teamId} className="card" style={{ minWidth: 180 }}>
                <div style={{ fontWeight: 600 }}>{t.teamName}</div>
                <div style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--color-primary)' }}>{t.assignmentsInWindow}</div>
                <div style={{ color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>
                  assignments across {t.distinctVolunteersInWindow} of {t.memberCount} members
                </div>
              </div>
            ))}
            {teamSummary?.length === 0 && <p>No teams yet.</p>}
          </div>
        )}
      </section>

      <section style={{ marginBottom: '2rem' }}>
        <h2>Volunteer load by team (all time)</h2>
        {historyLoading ? (
          <p>Loading…</p>
        ) : chartData.length === 0 ? (
          <p>No assignment history yet.</p>
        ) : (
          <div className="card" style={{ padding: '1.5rem 1.25rem 1.25rem' }}>
            <StackedBarChart data={chartData} />
            <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem', fontSize: '0.8rem', color: 'var(--color-text-muted)', flexWrap: 'wrap' }}>
              {teamNames.map((teamName, i) => (
                <span key={teamName} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                  <span style={{ width: 12, height: 12, borderRadius: 3, background: COLORS[i % COLORS.length] }} />
                  {teamName}
                </span>
              ))}
            </div>
          </div>
        )}
      </section>

      <section>
        <h2>Upcoming coverage gaps (next 8 weeks)</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {gaps?.map((g, i) => (
            <div key={i} className="card" style={{ display: 'flex', justifyContent: 'space-between', padding: '0.6rem 1.1rem', fontSize: '0.9rem' }}>
              <span>
                {g.eventName} — {g.roleName}
              </span>
              <span style={{ color: 'var(--color-text-muted)' }}>
                {format(new Date(g.startAt), 'PP')} · {g.slotsFilled}/{g.slotsNeeded} filled
              </span>
            </div>
          ))}
          {gaps?.length === 0 && <p>No gaps — everything's staffed for the next 8 weeks.</p>}
        </div>
      </section>
    </div>
  );
}

function BackupsCard() {
  const { data: status, isLoading } = useBackupStatus();
  const triggerBackup = useTriggerBackup();
  const [message, setMessage] = useState<string | null>(null);

  if (isLoading) return <p>Loading…</p>;

  const latestLocal = status?.local[0];
  const latestR2 = status?.r2[0];
  const isSynced = !!latestLocal && !!latestR2 && latestLocal.name === latestR2.name;

  function handleRunNow() {
    setMessage(null);
    triggerBackup.mutate(undefined, {
      onSuccess: (result) =>
        setMessage(
          result.uploadedToR2
            ? 'Backup complete and synced to Cloudflare R2.'
            : 'Backup complete (local only — R2 not configured or the upload failed; check server logs).',
        ),
      onError: (err) => setMessage(err instanceof Error ? err.message : 'Backup failed'),
    });
  }

  return (
    <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
      <div>
        {latestLocal ? (
          <>
            <div style={{ fontWeight: 600 }}>
              Last backup {formatDistanceToNow(new Date(latestLocal.createdAt), { addSuffix: true })}
            </div>
            <div style={{ color: 'var(--color-text-muted)', fontSize: '0.8rem', marginTop: '0.15rem' }}>
              {format(new Date(latestLocal.createdAt), 'PPPp')} · {status?.local.length} local ·{' '}
              {status?.r2.length ?? 0} in R2
            </div>
          </>
        ) : (
          <div style={{ color: 'var(--color-text-muted)' }}>No backups yet.</div>
        )}
        {message && <div style={{ fontSize: '0.85rem', marginTop: '0.4rem' }}>{message}</div>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        {!status?.r2Configured ? (
          <span className="badge badge-warning">Off-Pi backup not configured</span>
        ) : isSynced ? (
          <span className="badge badge-success">Synced to Cloudflare R2</span>
        ) : (
          <span className="badge badge-warning">Not yet synced</span>
        )}
        <button type="button" onClick={handleRunNow} disabled={triggerBackup.isPending} className="btn btn-primary btn-sm">
          {triggerBackup.isPending ? 'Backing up…' : 'Back up now'}
        </button>
      </div>
    </div>
  );
}
