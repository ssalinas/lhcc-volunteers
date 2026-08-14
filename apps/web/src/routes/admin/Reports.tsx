import { useMemo } from 'react';
import { addWeeks, format } from 'date-fns';
import { StackedBarChart, type StackedBarDatum } from '../../components/StackedBarChart.js';
import { useCoverageReport, useTeamSummaryReport, useVolunteerHistoryReport } from '../../api/hooks.js';

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
