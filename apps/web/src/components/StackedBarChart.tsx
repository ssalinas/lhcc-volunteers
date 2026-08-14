export interface StackedBarSegment {
  label: string;
  value: number;
  color: string;
}

export interface StackedBarDatum {
  name: string;
  segments: StackedBarSegment[];
}

/**
 * Minimal dependency-free stacked bar chart (plain flexbox/CSS, no SVG charting
 * library) — kept intentionally simple since this only needs to show relative
 * volunteer load per team.
 */
export function StackedBarChart({ data, height = 240 }: { data: StackedBarDatum[]; height?: number }) {
  const maxTotal = Math.max(1, ...data.map((d) => d.segments.reduce((sum, s) => sum + s.value, 0)));

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '1.5rem', height, borderBottom: '1px solid #ddd', padding: '0 0.5rem' }}>
        {data.map((d) => {
          const total = d.segments.reduce((sum, s) => sum + s.value, 0);
          return (
            <div key={d.name} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end' }}>
              <div style={{ fontSize: '0.75rem', color: '#666', marginBottom: 2 }}>{total || ''}</div>
              <div
                style={{
                  width: '60%',
                  minWidth: 24,
                  display: 'flex',
                  flexDirection: 'column-reverse',
                  borderRadius: '4px 4px 0 0',
                  overflow: 'hidden',
                }}
              >
                {d.segments.map((s) => (
                  <div
                    key={s.label}
                    title={`${s.label}: ${s.value}`}
                    style={{
                      height: total > 0 ? `${(s.value / maxTotal) * height}px` : 0,
                      background: s.color,
                    }}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: '1.5rem', padding: '0.5rem 0.5rem 0' }}>
        {data.map((d) => (
          <div key={d.name} style={{ flex: 1, textAlign: 'center', fontSize: '0.75rem', color: '#666' }}>
            {d.name}
          </div>
        ))}
      </div>
    </div>
  );
}
