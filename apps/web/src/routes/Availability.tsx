import { useState, type FormEvent } from 'react';
import { format } from 'date-fns';
import { useAddAvailability, useDeleteAvailability, useMyAvailability } from '../api/hooks.js';

export default function Availability() {
  const { data: entries, isLoading } = useMyAvailability();
  const add = useAddAvailability();
  const del = useDeleteAvailability();

  const today = format(new Date(), 'yyyy-MM-dd');
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [status, setStatus] = useState<'available' | 'unavailable'>('available');

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    add.mutate({ startDate, endDate, status });
  }

  const sorted = [...(entries ?? [])].sort((a, b) => a.startDate.localeCompare(b.startDate));

  return (
    <div>
      <h1>My Availability</h1>
      <p>
        Mark the dates you <strong>are</strong> available to volunteer. If a date isn't covered by an
        "available" entry below, you're assumed unavailable and won't be scheduled.
      </p>

      <form
        onSubmit={handleSubmit}
        style={{
          display: 'flex',
          gap: '0.75rem',
          alignItems: 'flex-end',
          flexWrap: 'wrap',
          background: '#fff',
          padding: '1rem',
          borderRadius: 10,
          boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
          marginBottom: '1.5rem',
        }}
      >
        <Field label="Start date">
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
        </Field>
        <Field label="End date">
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required />
        </Field>
        <Field label="Status">
          <select value={status} onChange={(e) => setStatus(e.target.value as 'available' | 'unavailable')}>
            <option value="available">Available</option>
            <option value="unavailable">Unavailable</option>
          </select>
        </Field>
        <button
          type="submit"
          disabled={add.isPending}
          style={{ padding: '0.5rem 1.25rem', borderRadius: 8, border: 'none', background: '#2f6f4f', color: '#fff', cursor: 'pointer', height: 38 }}
        >
          Add
        </button>
      </form>

      {isLoading ? (
        <p>Loading…</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {sorted.map((entry) => (
            <div
              key={entry.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '0.75rem 1rem',
                background: '#fff',
                borderRadius: 8,
                boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
              }}
            >
              <span>
                <strong style={{ color: entry.status === 'available' ? '#2f6f4f' : '#b00020' }}>
                  {entry.status === 'available' ? 'Available' : 'Unavailable'}
                </strong>{' '}
                {entry.startDate === entry.endDate ? entry.startDate : `${entry.startDate} → ${entry.endDate}`}
              </span>
              <button
                type="button"
                onClick={() => del.mutate(entry.id)}
                style={{ border: 'none', background: 'transparent', color: '#999', cursor: 'pointer' }}
              >
                Remove
              </button>
            </div>
          ))}
          {sorted.length === 0 && <p>No availability entries yet.</p>}
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
