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

// NOTE: Programmatic routine creation via Amazon's Behaviors API
// (createPrayerRoutines, buildRoutinePayload, createRoutine,
// deleteExistingAdhanRoutines) was REMOVED. Amazon does not permit third-party
// skills to create routines — the API always returned 404/403. The supported
// path is the virtual doorbell + a user-created routine (see alexaEventGateway.js).
// This module now exists only to supply Amazon access tokens for the
// speaker-groups endpoint. Do not reintroduce the Behaviors API path.

module.exports = {
  getAmazonAccessToken,
};
