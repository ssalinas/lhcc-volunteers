import { AvailabilityDateList } from '../components/AvailabilityDateList.js';
import { useMyProfile, useUpdateMyPreferences } from '../api/hooks.js';

export default function Availability() {
  const { data: me } = useMyProfile();
  const updatePreferences = useUpdateMyPreferences();

  return (
    <div>
      <h1>My Availability</h1>
      <p>
        Mark whether you're available for each upcoming date below. If you haven't responded for a
        date, you're assumed unavailable and won't be scheduled.
      </p>

      {me && (
        <label
          className="card"
          style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1.5rem', fontSize: '0.9rem' }}
        >
          <input
            type="checkbox"
            checked={me.receiveAvailabilityReminders}
            onChange={(e) => updatePreferences.mutate({ receiveAvailabilityReminders: e.target.checked })}
          />
          Email me reminders when I have upcoming dates without availability set
        </label>
      )}

      <AvailabilityDateList />
    </div>
  );
}
