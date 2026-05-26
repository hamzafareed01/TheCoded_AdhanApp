/**
 * alexaReminders.js
 * 
 * Manages Alexa Reminders API calls and tracks reminder state in the DB.
 * 
 * The Alexa Reminders API uses:
 *   - apiAccessToken: from the skill invocation context (context.System.apiAccessToken)
 *   - apiEndpoint:    from the skill invocation context (context.System.apiEndpoint)
 * 
 * These are passed from the Lambda handler to this service.
 * They are short-lived per-invocation tokens — NOT stored in the DB.
 * 
 * The Alexa reminder IDs (returned by the API) ARE stored in the DB
 * so we can update/delete them when the user changes settings.
 */

'use strict';

const { sql } = require('../db/sql');

const PRAYERS = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];

// ─── Reminders API helpers ────────────────────────────────────────────────────

/**
 * Build the scheduled datetime for today's prayer in ISO 8601 local time.
 * e.g. "2026-05-25T03:46:00" with timeZoneId "America/Chicago"
 */
function buildScheduledDateTime(timeHHMM, dateStr) {
  // dateStr: "YYYY-MM-DD" or undefined (use today)
  const [hh, mm] = (timeHHMM || '00:00').split(':').map(Number);
  const base = dateStr ? new Date(`${dateStr}T00:00:00`) : new Date();
  const year  = base.getFullYear();
  const month = String(base.getMonth() + 1).padStart(2, '0');
  const day   = String(base.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}T${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}:00`;
}

/**
 * Build the Alexa Reminders API payload for a prayer reminder.
 */
function buildPrayerReminderPayload(prayerName, timeHHMM, timezone, invocationName) {
  const label = prayerName.charAt(0).toUpperCase() + prayerName.slice(1);
  const scheduledTime = buildScheduledDateTime(timeHHMM);
  const skill = invocationName || 'adhan now';

  return {
    requestTime: new Date().toISOString(),
    trigger: {
      type: 'SCHEDULED_ABSOLUTE',
      scheduledTime,
      timeZoneId: timezone || 'America/New_York',
      recurrence: {
        freq: 'DAILY',
      },
    },
    alertInfo: {
      spokenInfo: {
        content: [
          {
            locale: 'en-US',
            text:  `It is time for ${label} prayer`,
            ssml: `<speak>It is time for ${label} prayer. <break time="1s"/> Asking Alexa to open ${skill} and play ${prayerName} adhan.</speak>`,
          },
        ],
      },
    },
    pushNotification: {
      status: 'ENABLED',
    },
  };
}

/**
 * Build the Alexa Reminders API payload for a pre-prayer reminder.
 * e.g. 10 minutes before Fajr
 */
function buildPrePrayerReminderPayload(prayerName, timeHHMM, minutesBefore, timezone) {
  const label = prayerName.charAt(0).toUpperCase() + prayerName.slice(1);

  // Subtract minutesBefore from prayer time
  const [hh, mm] = (timeHHMM || '00:00').split(':').map(Number);
  const totalMins = hh * 60 + mm - minutesBefore;
  const adjH = Math.floor(((totalMins % 1440) + 1440) % 1440 / 60);
  const adjM = ((totalMins % 1440) + 1440) % 1440 % 60;
  const adjTime = `${String(adjH).padStart(2,'0')}:${String(adjM).padStart(2,'0')}`;
  const scheduledTime = buildScheduledDateTime(adjTime);

  return {
    requestTime: new Date().toISOString(),
    trigger: {
      type: 'SCHEDULED_ABSOLUTE',
      scheduledTime,
      timeZoneId: timezone || 'America/New_York',
      recurrence: {
        freq: 'DAILY',
      },
    },
    alertInfo: {
      spokenInfo: {
        content: [
          {
            locale: 'en-US',
            text: `${label} prayer is in ${minutesBefore} minutes`,
            ssml: `<speak>${label} prayer is in ${minutesBefore} minutes.</speak>`,
          },
        ],
      },
    },
    pushNotification: {
      status: 'ENABLED',
    },
  };
}

/**
 * Build the Alexa Reminders API payload for a tilawat (Quran) schedule.
 */
function buildTilawatReminderPayload(timeHHMM, timezone, surahTitle) {
  const scheduledTime = buildScheduledDateTime(timeHHMM);
  const label = surahTitle || 'Quran recitation';

  return {
    requestTime: new Date().toISOString(),
    trigger: {
      type: 'SCHEDULED_ABSOLUTE',
      scheduledTime,
      timeZoneId: timezone || 'America/New_York',
      recurrence: {
        freq: 'DAILY',
      },
    },
    alertInfo: {
      spokenInfo: {
        content: [
          {
            locale: 'en-US',
            text:  `Time for your scheduled ${label} recitation`,
            ssml: `<speak>Time for your scheduled ${label} recitation.</speak>`,
          },
        ],
      },
    },
    pushNotification: {
      status: 'ENABLED',
    },
  };
}

// ─── Alexa API calls ──────────────────────────────────────────────────────────

async function callRemindersApi(apiEndpoint, apiAccessToken, method, path, body) {
  const url = `${apiEndpoint}/v1/alerts/reminders${path}`;
  const opts = {
    method,
    headers: {
      Authorization: `Bearer ${apiAccessToken}`,
      'Content-Type': 'application/json',
    },
  };
  if (body) opts.body = JSON.stringify(body);

  const resp = await fetch(url, opts);

  if (method === 'DELETE' && resp.status === 204) return { ok: true };
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    const err = new Error(`Reminders API ${method} ${path} failed: ${resp.status} ${text}`);
    err.status = resp.status;
    throw err;
  }

  return resp.json().catch(() => ({ ok: true }));
}

async function createReminder(apiEndpoint, apiAccessToken, payload) {
  return callRemindersApi(apiEndpoint, apiAccessToken, 'POST', '', payload);
}

async function updateReminder(apiEndpoint, apiAccessToken, reminderId, payload) {
  return callRemindersApi(apiEndpoint, apiAccessToken, 'PUT', `/${reminderId}`, payload);
}

async function deleteReminder(apiEndpoint, apiAccessToken, reminderId) {
  return callRemindersApi(apiEndpoint, apiAccessToken, 'DELETE', `/${reminderId}`, null);
}

// ─── DB helpers ───────────────────────────────────────────────────────────────

async function getStoredReminders(pool, userId) {
  const result = await pool
    .request()
    .input('user_id', sql.UniqueIdentifier, userId)
    .query(`
      SELECT id, reminder_type, prayer_name, schedule_id, alexa_reminder_id,
             scheduled_time_utc, timezone, status
      FROM dbo.alexa_reminders
      WHERE user_id = @user_id
    `);
  return result.recordset || [];
}

async function upsertReminderRecord(pool, userId, params) {
  const {
    reminderType,
    prayerName,
    scheduleId,
    alexaReminderId,
    scheduledTime,
    timezone,
    status,
    errorMessage,
  } = params;

  await pool
    .request()
    .input('user_id',           sql.UniqueIdentifier, userId)
    .input('reminder_type',     sql.NVarChar(20),     reminderType)
    .input('prayer_name',       sql.NVarChar(20),     prayerName || null)
    .input('schedule_id',       sql.UniqueIdentifier, scheduleId || null)
    .input('alexa_reminder_id', sql.NVarChar(255),    alexaReminderId || null)
    .input('scheduled_time',    sql.NVarChar(8),      scheduledTime || null)
    .input('timezone',          sql.NVarChar(100),    timezone || null)
    .input('status',            sql.NVarChar(30),     status || 'active')
    .input('error_message',     sql.NVarChar(1000),   errorMessage || null)
    .query(`
      MERGE dbo.alexa_reminders AS target
      USING (
        SELECT @user_id AS user_id,
               @reminder_type AS reminder_type,
               @prayer_name   AS prayer_name,
               @schedule_id   AS schedule_id
      ) AS src
      ON  target.user_id       = src.user_id
      AND target.reminder_type = src.reminder_type
      AND (
            (target.prayer_name  = src.prayer_name  AND src.prayer_name  IS NOT NULL)
         OR (target.schedule_id  = src.schedule_id  AND src.schedule_id  IS NOT NULL)
         )
      WHEN MATCHED THEN UPDATE SET
        alexa_reminder_id = @alexa_reminder_id,
        scheduled_time_utc = @scheduled_time,
        timezone           = @timezone,
        status             = @status,
        error_message      = @error_message,
        last_scheduled_at  = SYSUTCDATETIME(),
        updated_at         = SYSUTCDATETIME()
      WHEN NOT MATCHED THEN INSERT (
        user_id, reminder_type, prayer_name, schedule_id,
        alexa_reminder_id, scheduled_time_utc, timezone, status,
        error_message, last_scheduled_at
      ) VALUES (
        @user_id, @reminder_type, @prayer_name, @schedule_id,
        @alexa_reminder_id, @scheduled_time, @timezone, @status,
        @error_message, SYSUTCDATETIME()
      );
    `);
}

// ─── Main scheduling logic ────────────────────────────────────────────────────

/**
 * Schedule (or update) all prayer reminders for a user.
 *
 * @param {object} pool          - mssql connection pool
 * @param {string} userId        - AdhanNow user UUID
 * @param {string} apiAccessToken - from Alexa skill invocation context
 * @param {string} apiEndpoint    - from Alexa skill invocation context
 * @param {object} prayerTimes   - { fajr, dhuhr, asr, maghrib, isha } in HH:MM
 * @param {string} timezone      - IANA timezone string
 * @param {string} invocationName - skill invocation name
 * @param {object} options
 * @param {number|null} options.prePrayerMinutes - minutes before prayer for pre-reminder (null = off)
 * @param {object[]} options.tilawatSchedules    - from dbo.schedules
 * @param {object}   options.quietHours          - { enabled, from, to } in HH:MM
 */
async function scheduleAllReminders(pool, userId, apiAccessToken, apiEndpoint, prayerTimes, timezone, invocationName, options = {}) {
  const {
    prePrayerMinutes = null,
    tilawatSchedules = [],
    quietHours = { enabled: false, from: '22:00', to: '07:00' },
  } = options;

  const storedReminders = await getStoredReminders(pool, userId);
  const storedMap = {};
  for (const r of storedReminders) {
    const key = r.prayer_name || String(r.schedule_id);
    storedMap[`${r.reminder_type}:${key}`] = r;
  }

  const results = { scheduled: [], skipped: [], errors: [] };

  // ── Prayer reminders ──────────────────────────────────────────────────────
  for (const prayerName of PRAYERS) {
    const timeHHMM = prayerTimes[prayerName];
    if (!timeHHMM) {
      results.skipped.push({ type: 'prayer', prayerName, reason: 'no_time' });
      continue;
    }

    // Check quiet hours — skip if prayer falls inside quiet window
    if (quietHours.enabled && isInQuietWindow(timeHHMM, quietHours.from, quietHours.to)) {
      results.skipped.push({ type: 'prayer', prayerName, reason: 'quiet_hours' });
      await upsertReminderRecord(pool, userId, {
        reminderType: 'prayer',
        prayerName,
        scheduledTime: timeHHMM,
        timezone,
        status: 'paused',
        errorMessage: 'Skipped — falls within quiet hours',
      });
      continue;
    }

    const payload = buildPrayerReminderPayload(prayerName, timeHHMM, timezone, invocationName);
    const existing = storedMap[`prayer:${prayerName}`];

    try {
      let reminderId;
      if (existing?.alexa_reminder_id && existing.status === 'active') {
        // Update existing reminder if time changed
        if (existing.scheduled_time_utc !== timeHHMM) {
          await updateReminder(apiEndpoint, apiAccessToken, existing.alexa_reminder_id, payload);
        }
        reminderId = existing.alexa_reminder_id;
      } else {
        // Create new reminder
        const created = await createReminder(apiEndpoint, apiAccessToken, payload);
        reminderId = created.alertToken || created.id || null;
      }

      await upsertReminderRecord(pool, userId, {
        reminderType: 'prayer',
        prayerName,
        alexaReminderId: reminderId,
        scheduledTime: timeHHMM,
        timezone,
        status: 'active',
      });

      results.scheduled.push({ type: 'prayer', prayerName, time: timeHHMM, reminderId });
    } catch (err) {
      console.error(`[alexaReminders] Failed to schedule ${prayerName} reminder:`, err.message);
      await upsertReminderRecord(pool, userId, {
        reminderType: 'prayer',
        prayerName,
        scheduledTime: timeHHMM,
        timezone,
        status: 'error',
        errorMessage: err.message,
      });
      results.errors.push({ type: 'prayer', prayerName, error: err.message });
    }

    // ── Pre-prayer reminder ─────────────────────────────────────────────────
    if (prePrayerMinutes && prePrayerMinutes > 0) {
      const prePayload = buildPrePrayerReminderPayload(prayerName, timeHHMM, prePrayerMinutes, timezone);
      const preKey = `pre_prayer:${prayerName}`;
      const existingPre = storedMap[preKey];

      try {
        let preReminderId;
        if (existingPre?.alexa_reminder_id && existingPre.status === 'active') {
          if (existingPre.scheduled_time_utc !== timeHHMM) {
            await updateReminder(apiEndpoint, apiAccessToken, existingPre.alexa_reminder_id, prePayload);
          }
          preReminderId = existingPre.alexa_reminder_id;
        } else {
          const created = await createReminder(apiEndpoint, apiAccessToken, prePayload);
          preReminderId = created.alertToken || created.id || null;
        }

        await upsertReminderRecord(pool, userId, {
          reminderType: 'pre_prayer',
          prayerName,
          alexaReminderId: preReminderId,
          scheduledTime: timeHHMM,
          timezone,
          status: 'active',
        });

        results.scheduled.push({ type: 'pre_prayer', prayerName, time: timeHHMM, reminderId: preReminderId });
      } catch (err) {
        console.error(`[alexaReminders] Failed pre-prayer ${prayerName}:`, err.message);
        results.errors.push({ type: 'pre_prayer', prayerName, error: err.message });
      }
    }
  }

  // ── Tilawat schedule reminders ────────────────────────────────────────────
  for (const schedule of tilawatSchedules) {
    if (!schedule.enabled) continue;
    const timeHHMM = String(schedule.timeOfDay || schedule.time_of_day || '').slice(0, 5);
    if (!timeHHMM) continue;

    const surahTitle = schedule.payload?.title || `Surah ${schedule.payload?.surahNumber || ''}`;
    const payload = buildTilawatReminderPayload(timeHHMM, timezone, surahTitle);
    const scheduleId = schedule.id;
    const existing = storedMap[`tilawat:${scheduleId}`];

    try {
      let reminderId;
      if (existing?.alexa_reminder_id && existing.status === 'active') {
        await updateReminder(apiEndpoint, apiAccessToken, existing.alexa_reminder_id, payload);
        reminderId = existing.alexa_reminder_id;
      } else {
        const created = await createReminder(apiEndpoint, apiAccessToken, payload);
        reminderId = created.alertToken || created.id || null;
      }

      await upsertReminderRecord(pool, userId, {
        reminderType: 'tilawat',
        prayerName: null,
        scheduleId,
        alexaReminderId: reminderId,
        scheduledTime: timeHHMM,
        timezone,
        status: 'active',
      });

      results.scheduled.push({ type: 'tilawat', scheduleId, time: timeHHMM, reminderId });
    } catch (err) {
      console.error(`[alexaReminders] Failed tilawat reminder ${scheduleId}:`, err.message);
      results.errors.push({ type: 'tilawat', scheduleId, error: err.message });
    }
  }

  return results;
}

/**
 * Delete all reminders for a user (e.g. when they disable automation).
 */
async function deleteAllReminders(pool, userId, apiAccessToken, apiEndpoint) {
  const stored = await getStoredReminders(pool, userId);
  const results = { deleted: [], errors: [] };

  for (const r of stored) {
    if (!r.alexa_reminder_id) continue;
    try {
      await deleteReminder(apiEndpoint, apiAccessToken, r.alexa_reminder_id);
      await pool
        .request()
        .input('id', sql.UniqueIdentifier, r.id)
        .query(`UPDATE dbo.alexa_reminders SET status = 'deleted', updated_at = SYSUTCDATETIME() WHERE id = @id`);
      results.deleted.push(r.alexa_reminder_id);
    } catch (err) {
      console.error(`[alexaReminders] Failed to delete reminder ${r.alexa_reminder_id}:`, err.message);
      results.errors.push({ id: r.alexa_reminder_id, error: err.message });
    }
  }

  return results;
}

// ─── Quiet hours check ────────────────────────────────────────────────────────

/**
 * Returns true if timeHHMM falls within the quiet window [from, to].
 * Handles overnight windows (e.g. 22:00 → 07:00).
 */
function isInQuietWindow(timeHHMM, from, to) {
  const toMins = (hhmm) => {
    const [h, m] = (hhmm || '00:00').split(':').map(Number);
    return h * 60 + m;
  };

  const t = toMins(timeHHMM);
  const f = toMins(from);
  const e = toMins(to);

  if (f <= e) {
    // Same-day window e.g. 08:00 → 20:00
    return t >= f && t <= e;
  } else {
    // Overnight window e.g. 22:00 → 07:00
    return t >= f || t <= e;
  }
}

module.exports = {
  scheduleAllReminders,
  deleteAllReminders,
  getStoredReminders,
  isInQuietWindow,
  buildPrayerReminderPayload,
  buildPrePrayerReminderPayload,
  buildTilawatReminderPayload,
};
