import { getLastAvailabilityReminderSend, sendAvailabilityRemindersNow } from '../../jobs/sendAvailabilityReminders.js';

export async function triggerAvailabilityRemindersNow(logger?: Parameters<typeof sendAvailabilityRemindersNow>[0]) {
  return sendAvailabilityRemindersNow(logger);
}

export async function getAvailabilityReminderStatus() {
  const last = await getLastAvailabilityReminderSend();
  return {
    lastSentAt: last?.sentAt ?? null,
    remindersSent: last?.remindersSent ?? null,
    triggeredBy: last?.triggeredBy ?? null,
  };
}
