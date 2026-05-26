'use strict';

/**
 * alexaRoutineCreator.js
 *
 * Creates Alexa Routines programmatically using the user's stored Amazon
 * access token (from alexa_app_link_tokens). Called automatically when
 * the user completes onboarding (Step 6).
 *
 * Each routine:
 *  - Triggers daily at the prayer time
 *  - Action: invokes the AdhanNow custom skill → plays Adhan
 *
 * Amazon Behaviors API: POST https://api.amazonalexa.com/v1/behaviors/automations
 */

const AMAZON_BEHAVIORS_API = 'https://api.amazonalexa.com/v1/behaviors/automations';
const PRAYERS = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];

// ─── Token helpers ────────────────────────────────────────────────────────────

/**
 * Fetch the stored Amazon access token for a user.
 * Refreshes if expired.
 */
async function getAmazonAccessToken(pool, userId) {
  const { sql } = require('../db/sql');

  const result = await pool
    .request()
    .input('user_id', sql.UniqueIdentifier, userId)
    .query(`
      SELECT TOP 1
        amazon_access_token,
        amazon_refresh_token,
        amazon_token_expires_at
      FROM dbo.alexa_app_link_tokens
      WHERE user_id = @user_id
      ORDER BY created_at DESC
    `);

  const row = result.recordset[0];
  if (!row?.amazon_access_token) {
    throw new Error('No Amazon access token found for user. User must complete account linking.');
  }

  // Check if token is expired (refresh if within 5 minutes of expiry)
  const expiresAt = row.amazon_token_expires_at ? new Date(row.amazon_token_expires_at) : null;
  const now = new Date();
  const bufferMs = 5 * 60 * 1000;

  if (expiresAt && now.getTime() > expiresAt.getTime() - bufferMs) {
    // Token expired or expiring — refresh it
    if (!row.amazon_refresh_token) {
      throw new Error('Amazon token expired and no refresh token available. User must re-link account.');
    }
    return refreshAmazonToken(pool, userId, row.amazon_refresh_token);
  }

  return row.amazon_access_token;
}

async function refreshAmazonToken(pool, userId, refreshToken) {
  const { sql } = require('../db/sql');

  const clientId     = process.env.AMAZON_LOGIN_CLIENT_ID;
  const clientSecret = process.env.AMAZON_LOGIN_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('AMAZON_LOGIN_CLIENT_ID or AMAZON_LOGIN_CLIENT_SECRET not configured');
  }

  const resp = await fetch('https://api.amazon.com/auth/o2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type:    'refresh_token',
      refresh_token: refreshToken,
      client_id:     clientId,
      client_secret: clientSecret,
    }).toString(),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`Amazon token refresh failed: ${resp.status} ${text}`);
  }

  const data = await resp.json();
  const newToken    = data.access_token;
  const newRefresh  = data.refresh_token || refreshToken;
  const expiresIn   = Number(data.expires_in || 3600);
  const expiresAt   = new Date(Date.now() + expiresIn * 1000);

  await pool
    .request()
    .input('user_id',                  sql.UniqueIdentifier, userId)
    .input('amazon_access_token',      sql.NVarChar(sql.MAX), newToken)
    .input('amazon_refresh_token',     sql.NVarChar(sql.MAX), newRefresh)
    .input('amazon_token_expires_at',  sql.DateTime2, expiresAt)
    .query(`
      UPDATE dbo.alexa_app_link_tokens
      SET
        amazon_access_token     = @amazon_access_token,
        amazon_refresh_token    = @amazon_refresh_token,
        amazon_token_expires_at = @amazon_token_expires_at,
        updated_at              = SYSUTCDATETIME()
      WHERE user_id = @user_id
    `);

  return newToken;
}

// ─── Routine payload builder ──────────────────────────────────────────────────

/**
 * Build the Amazon Behaviors API payload for a single prayer routine.
 *
 * Trigger:  SCHEDULED_ABSOLUTE daily at prayer time
 * Action:   Invoke AdhanNow custom skill (plays Adhan via AudioPlayer)
 */
function buildRoutinePayload(params) {
  const {
    prayerName,
    timeHHMM,
    timezone,
    skillId,
    deviceSerialNumber,
    deviceType,
    locale,
  } = params;

  const label = prayerName.charAt(0).toUpperCase() + prayerName.slice(1);

  // Build ISO datetime for today at prayer time
  const [hh, mm] = (timeHHMM || '00:00').split(':').map(Number);
  const now   = new Date();
  const year  = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day   = String(now.getDate()).padStart(2, '0');
  const scheduledTime = `${year}-${month}-${day}T${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}:00.000`;

  return {
    name: `AdhanNow — ${label} Prayer`,
    enabled: true,
    triggers: [
      {
        id: `trigger_${prayerName}_${Date.now()}`,
        type: 'CustomEvent',
        payload: {
          type: 'Scheduled',
          scheduledTime,
          timeZoneId: timezone || 'America/New_York',
          recurrenceRule: 'FREQ=DAILY',
          schedulingStrategy: 'RESTRICT_FUTURE',
        },
      },
    ],
    sequence: {
      startNode: {
        '@type': 'com.amazon.alexa.behaviors.model.SerialNode',
        nodesToExecute: [
          {
            '@type': 'com.amazon.alexa.behaviors.model.OpaquePayloadOperationNode',
            type: 'Alexa.Operation.SkillConnections.StartSkill',
            operationPayload: {
              deviceType:           deviceType           || 'ALEXA_CURRENT_DEVICE_TYPE',
              deviceSerialNumber:   deviceSerialNumber   || 'ALEXA_CURRENT_DEVICE_SN',
              locale:               locale               || 'en-US',
              customerId:           'CURRENT_USER',
              skillId:              skillId,
              connectionRequest: {
                uri: `connection://intent/PlayPrayerAdhanIntent?prayer=${prayerName}`,
                input: {
                  prayer: prayerName,
                },
              },
            },
          },
        ],
      },
    },
  };
}

// ─── Behaviors API calls ──────────────────────────────────────────────────────

async function createRoutine(amazonAccessToken, payload) {
  const resp = await fetch(AMAZON_BEHAVIORS_API, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${amazonAccessToken}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (resp.status === 201 || resp.status === 200) {
    const location = resp.headers.get('location') || '';
    const routineId = location.split('/').pop() || null;
    return { ok: true, routineId };
  }

  const text = await resp.text().catch(() => '');
  return { ok: false, status: resp.status, error: text };
}

async function deleteExistingAdhanRoutines(amazonAccessToken) {
  // List existing routines and delete any AdhanNow ones
  const resp = await fetch(`${AMAZON_BEHAVIORS_API}?limit=100`, {
    headers: { Authorization: `Bearer ${amazonAccessToken}` },
  });

  if (!resp.ok) return; // Fail silently — deletion is best-effort

  const data = await resp.json().catch(() => ({ automations: [] }));
  const existing = (data.automations || []).filter(
    (r) => String(r.name || '').startsWith('AdhanNow —')
  );

  for (const routine of existing) {
    if (!routine.automationId) continue;
    await fetch(`${AMAZON_BEHAVIORS_API}/${routine.automationId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${amazonAccessToken}` },
    }).catch(() => {}); // Fail silently
  }
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Create all 5 prayer routines for a user automatically.
 * Called from the backend after onboarding Step 6 completes.
 *
 * @param {object} pool        mssql connection pool
 * @param {string} userId      AdhanNow user UUID
 * @param {object} prayerTimes { fajr, dhuhr, asr, maghrib, isha } in HH:MM
 * @param {string} timezone    IANA timezone
 * @param {object} options
 */
async function createPrayerRoutines(pool, userId, prayerTimes, timezone, options = {}) {
  const {
    skillId   = process.env.ALEXA_SKILL_ID,
    locale    = 'en-US',
  } = options;

  if (!skillId) {
    throw new Error('ALEXA_SKILL_ID environment variable is not set');
  }

  // Get stored Amazon access token
  const amazonAccessToken = await getAmazonAccessToken(pool, userId);

  // Delete existing AdhanNow routines first (avoid duplicates on re-run)
  await deleteExistingAdhanRoutines(amazonAccessToken);

  const results = { created: [], failed: [], unsupported: false };

  for (const prayerName of PRAYERS) {
    const timeHHMM = prayerTimes[prayerName];
    if (!timeHHMM) {
      results.failed.push({ prayerName, error: 'No prayer time available' });
      continue;
    }

    const payload = buildRoutinePayload({
      prayerName,
      timeHHMM,
      timezone,
      skillId,
      locale,
    });

    const result = await createRoutine(amazonAccessToken, payload);

    if (result.ok) {
      results.created.push({ prayerName, time: timeHHMM, routineId: result.routineId });
      console.log(`[alexaRoutineCreator] Created routine for ${prayerName} at ${timeHHMM}`);
    } else {
      // 403 or 405 means this API is not available with current token scope
      if (result.status === 403 || result.status === 405 || result.status === 404) {
        results.unsupported = true;
        console.warn(`[alexaRoutineCreator] Behaviors API not available (${result.status}) — falling back to reminder-based approach`);
        break;
      }
      results.failed.push({ prayerName, error: `${result.status}: ${result.error}` });
      console.error(`[alexaRoutineCreator] Failed to create routine for ${prayerName}:`, result.error);
    }
  }

  return results;
}

module.exports = {
  createPrayerRoutines,
  getAmazonAccessToken,
};
