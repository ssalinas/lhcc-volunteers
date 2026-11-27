import { getLastAvailabilityReminderSend, sendAvailabilityRemindersNow } from '../../jobs/sendAvailabilityReminders.js';
import { getAvailabilityRemindersAutomatic, setAvailabilityRemindersAutomatic } from '../../lib/settings.js';

export async function triggerAvailabilityRemindersNow(logger?: Parameters<typeof sendAvailabilityRemindersNow>[0]) {
  return sendAvailabilityRemindersNow(logger);
}

export async function getAvailabilityReminderStatus() {
  const [last, automatic] = await Promise.all([getLastAvailabilityReminderSend(), getAvailabilityRemindersAutomatic()]);
  return {
    lastSentAt: last?.sentAt ?? null,
    remindersSent: last?.remindersSent ?? null,
    triggeredBy: last?.triggeredBy ?? null,
    automatic,
  };
}

export async function setAutomaticAvailabilityReminders(enabled: boolean, userId: string) {
  await setAvailabilityRemindersAutomatic(enabled, userId);
  return getAvailabilityReminderStatus();
}
