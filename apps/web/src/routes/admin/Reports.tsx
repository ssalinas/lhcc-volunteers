import { useMemo } from 'react';
import { addWeeks, format } from 'date-fns';
import { StackedBarChart, type StackedBarDatum } from '../../components/StackedBarChart.js';
import { useCoverageReport, useTeamSummaryReport, useVolunteerHistoryReport } from '../../api/hooks.js';

const COLORS = ['#2f6f4f', '#5b8f6f', '#8ab89a', '#c8ddce', '#1f4a35'];

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
              <div key={t.teamId} style={{ background: '#fff', borderRadius: 10, padding: '1rem', boxShadow: '0 1px 2px rgba(0,0,0,0.08)', minWidth: 180 }}>
                <div style={{ fontWeight: 600 }}>{t.teamName}</div>
                <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#2f6f4f' }}>{t.assignmentsInWindow}</div>
                <div style={{ color: '#666', fontSize: '0.8rem' }}>assignments across {t.distinctVolunteersInWindow} of {t.memberCount} members</div>
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
          <div style={{ background: '#fff', borderRadius: 10, padding: '1.5rem 1rem 1rem', boxShadow: '0 1px 2px rgba(0,0,0,0.08)' }}>
            <StackedBarChart data={chartData} />
            <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem', fontSize: '0.8rem', color: '#666' }}>
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
            <div
              key={i}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '0.6rem 1rem',
                background: '#fff',
                borderRadius: 8,
                boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
                fontSize: '0.9rem',
              }}
            >
              <span>
                {g.eventName} — {g.roleName}
              </span>
              <span style={{ color: '#666' }}>
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
