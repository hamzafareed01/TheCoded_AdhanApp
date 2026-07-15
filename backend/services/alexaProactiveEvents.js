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
 *  4. At prayer time, backend calls sendDoorbellEvent() (alexaEventGateway.js)
 *  5. Amazon fires the Routine → Echo plays Adhan
 */

'use strict';


// Virtual doorbell endpoint ID — must match what the Smart Home Lambda returns in Discovery
const VIRTUAL_DOORBELL_ID = 'adhannow-prayer-doorbell';

// NOTE: The legacy sendDoorbellChangeReport() and getUserAmazonToken() were
// REMOVED. They sent the DoorbellPress using the Login-with-Amazon app-link
// token, which the Event Gateway silently rejects (401/403). The correct path
// is sendDoorbellEvent() in alexaEventGateway.js, which uses the AcceptGrant
// async-event token (alexa::async_event:write) — the only credential the
// Event Gateway accepts. Do not reintroduce the app-link-token path.

/**
 * Send doorbell trigger for a specific prayer for a user.
 * Called by the prayer scheduler at prayer time.
 *
 * Uses the AcceptGrant-derived async-event token (alexa::async_event:write) —
 * the only credential Amazon's Event Gateway accepts for proactive events.
 * The legacy Login-with-Amazon profile token does NOT work here.
 */
async function triggerPrayerDoorbell(pool, userId) {
  try {
    const { sendDoorbellEvent } = require('./alexaEventGateway');
    await sendDoorbellEvent(pool, userId, VIRTUAL_DOORBELL_ID);
    return { ok: true };
  } catch (err) {
    console.error(`[alexaProactiveEvents] Failed for user ${userId}:`, err.message);
    return { ok: false, code: err.code || null, error: err.message };
  }
}

module.exports = {
  triggerPrayerDoorbell,
  VIRTUAL_DOORBELL_ID,
};
