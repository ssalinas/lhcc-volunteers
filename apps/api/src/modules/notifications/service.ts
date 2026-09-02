import { sendAvailabilityRemindersNow } from '../../jobs/sendAvailabilityReminders.js';

export async function triggerAvailabilityRemindersNow(logger?: Parameters<typeof sendAvailabilityRemindersNow>[0]) {
  return sendAvailabilityRemindersNow(logger);
}
