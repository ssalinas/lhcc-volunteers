import { AvailabilityDateList } from '../components/AvailabilityDateList.js';

export default function Availability() {
  return (
    <div>
      <h1>My Availability</h1>
      <p>
        Mark whether you're available for each upcoming date below. If you haven't responded for a
        date, you're assumed unavailable and won't be scheduled.
      </p>
      <AvailabilityDateList />
    </div>
  );
}
