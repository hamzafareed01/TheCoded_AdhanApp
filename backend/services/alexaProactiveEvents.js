'use strict';

/**
 * alexaProactiveEvents.js
 *
 * Sends a Smart Home ChangeReport to Amazon to "trip" AdhanNow's
 * virtual doorbell sensor — this fires the user's Alexa Routine.
 *
 * Flow:
 *  1. User links Amazon account to AdhanNow
 *  2. Smart Home skill Discovery returns a virtual doorbell endpoint
 *  3. User creates Alexa Routine: trigger = "When AdhanNow Doorbell rings"
 *     action = "Play AdhanNow skill on [device]"
 *  4. At prayer time, backend calls sendDoorbellChangeReport()
 *  5. Amazon fires the Routine → Echo plays Adhan
 */

'use strict';

const AMAZON_API_BASE = 'https://api.amazonalexa.com/v3/events';

// Virtual doorbell endpoint ID — must match what the Smart Home Lambda returns in Discovery
const VIRTUAL_DOORBELL_ID = 'adhannow-prayer-doorbell';

/**
 * Get a fresh Amazon access token for the user.
 * Uses the stored app-link token.
 */
async function getUserAmazonToken(pool, userId) {
  const { getAmazonAccessToken } = require('./alexaRoutineCreator');
  return getAmazonAccessToken(pool, userId);
}

/**
 * Send a ChangeReport to Amazon that triggers the virtual doorbell.
 * This fires the user's Alexa Routine.
 *
 * @param {string} amazonToken - user's Amazon access token
 * @param {string} endpointId  - virtual endpoint ID (use VIRTUAL_DOORBELL_ID)
 * @param {string} userId      - AdhanNow user UUID (for correlation)
 */
async function sendDoorbellChangeReport(amazonToken, endpointId, userId) {
  const payload = {
    context:   {},
    event: {
      header: {
        namespace:        'Alexa.DoorbellEventSource',
        name:             'DoorbellPress',
        messageId:        `adhannow-${userId}-${Date.now()}`,
        payloadVersion:   '3',
      },
      endpoint: {
        scope: {
          type:  'BearerToken',
          token: amazonToken,
        },
        endpointId: endpointId || VIRTUAL_DOORBELL_ID,
      },
      payload: {
        cause: { type: 'PHYSICAL_INTERACTION' },
        timestamp: new Date().toISOString(),
      },
    },
  };

  const resp = await fetch(AMAZON_API_BASE, {
    method:  'POST',
    headers: {
      Authorization:  `Bearer ${amazonToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    const err = new Error(`Amazon ChangeReport failed: ${resp.status} ${text}`);
    err.status = resp.status;
    throw err;
  }

  return { ok: true };
}

/**
 * Send doorbell trigger for a specific prayer for a user.
 * Called by the prayer scheduler at prayer time.
 */
async function triggerPrayerDoorbell(pool, userId) {
  try {
    const amazonToken = await getUserAmazonToken(pool, userId);
    await sendDoorbellChangeReport(amazonToken, VIRTUAL_DOORBELL_ID, userId);
    return { ok: true };
  } catch (err) {
    console.error(`[alexaProactiveEvents] Failed for user ${userId}:`, err.message);
    return { ok: false, error: err.message };
  }
}

module.exports = {
  triggerPrayerDoorbell,
  sendDoorbellChangeReport,
  VIRTUAL_DOORBELL_ID,
};
