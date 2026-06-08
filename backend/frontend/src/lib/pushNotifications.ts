/**
 * src/lib/pushNotifications.ts
 *
 * Prayer time notifications using @capacitor/local-notifications.
 * No Firebase, no backend required — all scheduled on-device.
 *
 * Setup:
 *   npm install @capacitor/local-notifications
 *   npx cap sync android
 *
 * Called from App.tsx on every app open to reschedule upcoming prayers.
 */

import { apiFetch } from './api';

const CHANNEL_ID = 'prayer_times';
const CHANNEL_NAME = 'Prayer Times';

const PRAYER_LABELS: Record<string, string> = {
  fajr:    'Fajr',
  dhuhr:   'Dhuhr',
  asr:     'Asr',
  maghrib: 'Maghrib',
  isha:    'Isha',
};

// Notification IDs — fixed per prayer so rescheduling overwrites old ones
const NOTIF_IDS: Record<string, number> = {
  fajr_before:    1001,  fajr_now:    1002,  fajr_after:    1003,
  dhuhr_before:   1004,  dhuhr_now:   1005,  dhuhr_after:   1006,
  asr_before:     1007,  asr_now:     1008,  asr_after:     1009,
  maghrib_before: 1010,  maghrib_now: 1011,  maghrib_after: 1012,
  isha_before:    1013,  isha_now:    1014,  isha_after:    1015,
};

function minutesFromNow(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function todayAt(timeHHMM: string, timezone: string): Date | null {
  try {
    const [hh, mm] = timeHHMM.split(':').map(Number);
    const now = new Date();
    // Build a date in user's timezone
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric', month: '2-digit', day: '2-digit',
    });
    const parts = formatter.formatToParts(now);
    const year  = parts.find(p => p.type === 'year')?.value;
    const month = parts.find(p => p.type === 'month')?.value;
    const day   = parts.find(p => p.type === 'day')?.value;
    const localDateStr = `${year}-${month}-${day}T${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}:00`;

    // Get offset for the timezone at this time
    const target = new Date(localDateStr);
    const utcMs = target.getTime();
    const localMs = new Date(
      new Date(localDateStr).toLocaleString('en-US', { timeZone: timezone })
    ).getTime();
    const offset = localMs - utcMs;

    return new Date(utcMs - offset);
  } catch {
    return null;
  }
}

/**
 * Main entry point — call from App.tsx on every app open.
 * Requests permission and schedules all prayer notifications for today.
 */
export async function schedulePrayerNotifications(): Promise<void> {
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');

    // Request permission
    const perm = await LocalNotifications.requestPermissions();
    if (perm.display !== 'granted') return;

    // Create notification channel (Android 8+)
    await LocalNotifications.createChannel({
      id:          CHANNEL_ID,
      name:        CHANNEL_NAME,
      description: 'Prayer time reminders',
      importance:  5, // IMPORTANCE_HIGH
      sound:       'default',
      vibration:   true,
      visibility:  1,
    }).catch(() => {}); // Channel creation not supported on older Android

    // Fetch today's prayer times + user prefs from backend
    const res = await apiFetch('/api/alexa/skill/prayer-times');
    if (!res.ok) return;

    const data = await res.json() as {
      prayers24?: Record<string, string>;
      userContext?: { timezone?: string };
      settings?: {
        pushNotificationsEnabled?: boolean;
        pushBeforePrayerMin?: number | null;
        pushAfterPrayerMin?: number | null;
      };
    };

    const prayerTimes = data.prayers24 || {};
    const timezone    = data.userContext?.timezone || 'Etc/UTC';
    const prefs       = data.settings || {};

    if (prefs.pushNotificationsEnabled === false) return;

    const beforeMin = prefs.pushBeforePrayerMin ?? 10;
    const afterMin  = prefs.pushAfterPrayerMin  ?? 30;
    const now       = new Date();

    const notifications: Array<{
      id: number;
      title: string;
      body: string;
      at: Date;
    }> = [];

    for (const [prayer, timeHHMM] of Object.entries(prayerTimes)) {
      if (!PRAYER_LABELS[prayer]) continue;
      const label  = PRAYER_LABELS[prayer];
      const fireAt = todayAt(timeHHMM, timezone);
      if (!fireAt) continue;

      // Skip prayers that have already passed by more than 1 hour
      if (fireAt.getTime() < now.getTime() - 60 * 60 * 1000) continue;

      // Before prayer notification
      if (beforeMin && beforeMin > 0) {
        const beforeAt = minutesFromNow(fireAt, -beforeMin);
        if (beforeAt > now) {
          notifications.push({
            id:    NOTIF_IDS[`${prayer}_before`],
            title: `⏰ ${label} in ${beforeMin} minutes`,
            body:  `${label} prayer is in ${beforeMin} minutes. Prepare for prayer.`,
            at:    beforeAt,
          });
        }
      }

      // At prayer time notification
      if (fireAt > now) {
        notifications.push({
          id:    NOTIF_IDS[`${prayer}_now`],
          title: `🕌 ${label} time`,
          body:  `It's ${label} time. May Allah accept your prayer.`,
          at:    fireAt,
        });
      }

      // After prayer "have you prayed?" notification
      if (afterMin && afterMin > 0) {
        const afterAt = minutesFromNow(fireAt, afterMin);
        if (afterAt > now) {
          notifications.push({
            id:    NOTIF_IDS[`${prayer}_after`],
            title: `🤲 Have you prayed ${label}?`,
            body:  `It is Sunnah to pray on time. Pray your ${label} before the time passes.`,
            at:    afterAt,
          });
        }
      }
    }

    if (notifications.length === 0) return;

    // Cancel existing prayer notifications before rescheduling
    const cancelIds = Object.values(NOTIF_IDS).map(id => ({ id }));
    await LocalNotifications.cancel({ notifications: cancelIds }).catch(() => {});

    // Schedule all notifications
    await LocalNotifications.schedule({
      notifications: notifications.map(n => ({
        id:        n.id,
        title:     n.title,
        body:      n.body,
        schedule:  { at: n.at, allowWhileIdle: true },
        channelId: CHANNEL_ID,
        smallIcon: 'ic_launcher_foreground',
        sound:     'default',
        extra:     { type: 'prayer' },
      })),
    });

    console.log(`[push] Scheduled ${notifications.length} prayer notifications`);

  } catch (err) {
    if (String(err).includes('Cannot find module')) return;
    console.error('[push] schedulePrayerNotifications error:', err);
  }
}

// Keep old name as alias so App.tsx import works
export const registerFCMToken = schedulePrayerNotifications;
