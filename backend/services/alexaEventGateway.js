'use strict';

/**
 * alexaEventGateway.js
 *
 * Owns the credentials Amazon's Event Gateway actually requires for proactive
 * Smart Home events (the virtual prayer DoorbellPress).
 *
 * The flow:
 *  1. User enables the AdhanNow Smart Home skill + account links.
 *  2. Alexa sends an `Alexa.Authorization` / `AcceptGrant` directive to the
 *     Smart Home Lambda, which forwards it to /api/alexa/smart-home/accept-grant.
 *  3. handleAcceptGrant() identifies the user from the grantee token, exchanges
 *     the grant code at LWA using the skill's "Alexa Skill Messaging" client
 *     credentials, and stores the resulting access/refresh tokens. These carry
 *     the `alexa::async_event:write` scope.
 *  4. At prayer time, sendDoorbellEvent() POSTs a DoorbellPress to the Event
 *     Gateway using that token — the ONLY token Amazon accepts there.
 *
 * IMPORTANT: The token in alexa_app_link_tokens (Login-with-Amazon profile
 * token) does NOT work for /v3/events. That mismatch is why proactive events
 * silently 401/403'd before this module existed.
 */

const { sql } = require('../db/sql');

const LWA_TOKEN_URL = 'https://api.amazon.com/auth/o2/token';

function getEventGatewayUrl() {
  return (
    String(process.env.ALEXA_EVENT_GATEWAY_URL || '').trim() ||
    'https://api.amazonalexa.com/v3/events'
  );
}

/**
 * The "Alexa Skill Messaging" client credentials from the Smart Home skill's
 * Permissions page. These are distinct from the Login-with-Amazon security
 * profile and from AdhanNow's own account-linking OAuth credentials.
 */
function getMessagingCredentials() {
  const clientId =
    String(process.env.ALEXA_EVENT_GATEWAY_CLIENT_ID || '').trim() ||
    String(process.env.ALEXA_SKILL_MESSAGING_CLIENT_ID || '').trim();
  const clientSecret =
    String(process.env.ALEXA_EVENT_GATEWAY_CLIENT_SECRET || '').trim() ||
    String(process.env.ALEXA_SKILL_MESSAGING_CLIENT_SECRET || '').trim();
  return { clientId, clientSecret, configured: !!clientId && !!clientSecret };
}

async function upsertTokens(pool, userId, { accessToken, refreshToken, scope, expiresAt }) {
  await pool
    .request()
    .input('user_id', sql.UniqueIdentifier, userId)
    .input('access_token', sql.NVarChar(sql.MAX), accessToken || null)
    .input('refresh_token', sql.NVarChar(sql.MAX), refreshToken || null)
    .input('scope', sql.NVarChar(1000), scope || null)
    .input('expires_at', sql.DateTime2, expiresAt || null)
    .query(`
      MERGE dbo.alexa_event_gateway_tokens AS target
      USING (SELECT @user_id AS user_id) AS source
      ON target.user_id = source.user_id
      WHEN MATCHED THEN
        UPDATE SET
          access_token  = @access_token,
          refresh_token = COALESCE(@refresh_token, target.refresh_token),
          scope         = COALESCE(@scope, target.scope),
          expires_at    = @expires_at,
          revoked_at    = NULL,
          updated_at    = SYSUTCDATETIME()
      WHEN NOT MATCHED THEN
        INSERT (user_id, access_token, refresh_token, scope, expires_at)
        VALUES (@user_id, @access_token, @refresh_token, @scope, @expires_at);
    `);
}

async function getStoredTokenRow(pool, userId) {
  const result = await pool
    .request()
    .input('user_id', sql.UniqueIdentifier, userId)
    .query(`
      SELECT TOP 1 access_token, refresh_token, scope, expires_at, revoked_at
      FROM dbo.alexa_event_gateway_tokens
      WHERE user_id = @user_id
    `);
  return result.recordset[0] || null;
}

async function postToLwa(params) {
  const { clientId, clientSecret } = getMessagingCredentials();
  const resp = await fetch(LWA_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      ...params,
      client_id: clientId,
      client_secret: clientSecret,
    }).toString(),
  });

  const text = await resp.text().catch(() => '');
  if (!resp.ok) {
    const err = new Error(`LWA token request failed: ${resp.status} ${text}`);
    err.status = resp.status;
    throw err;
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error('LWA token response was not valid JSON.');
  }
}

/**
 * Exchange an AcceptGrant authorization code for async-event tokens and store them.
 */
async function exchangeAcceptGrantCode(pool, userId, code) {
  const creds = getMessagingCredentials();
  if (!creds.configured) {
    throw new Error(
      'ALEXA_EVENT_GATEWAY_CLIENT_ID / ALEXA_EVENT_GATEWAY_CLIENT_SECRET are not configured. ' +
        'Copy the Smart Home skill Permissions page "Alexa Skill Messaging" client ID/secret into the backend env.'
    );
  }

  const data = await postToLwa({ grant_type: 'authorization_code', code });
  const expiresIn = Number(data.expires_in || 3600);
  const expiresAt = new Date(Date.now() + expiresIn * 1000);

  await upsertTokens(pool, userId, {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    scope: data.scope,
    expiresAt,
  });

  return { ok: true, expiresAt };
}

/**
 * Return a valid async-event access token for the user, refreshing if expired.
 * Throws an actionable error if the user has not authorized the Smart Home skill.
 */
async function getValidAccessToken(pool, userId) {
  const accessToken = await getValidAccessToken(pool, userId);

  console.log("[EG] access token available:", !!accessToken);
  const row = await getStoredTokenRow(pool, userId);
  if (!row || row.revoked_at || !row.access_token) {
    const err = new Error(
      'No Smart Home async-event token for user. The user must enable the AdhanNow ' +
        'Smart Home skill and complete account linking so AcceptGrant can run.'
    );
    err.code = 'NO_ASYNC_GRANT';
    throw err;
  }

  const expiresAt = row.expires_at ? new Date(row.expires_at) : null;
  const bufferMs = 5 * 60 * 1000;
  const expiringSoon = expiresAt && Date.now() > expiresAt.getTime() - bufferMs;

  if (!expiringSoon) {
    return row.access_token;
  }

  if (!row.refresh_token) {
    const err = new Error('Async-event token expired and no refresh token is stored. User must relink.');
    err.code = 'ASYNC_GRANT_EXPIRED';
    throw err;
  }

  const data = await postToLwa({ grant_type: 'refresh_token', refresh_token: row.refresh_token });
  const expiresIn = Number(data.expires_in || 3600);
  const newExpiresAt = new Date(Date.now() + expiresIn * 1000);

  await upsertTokens(pool, userId, {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || row.refresh_token,
    scope: data.scope || row.scope,
    expiresAt: newExpiresAt,
  });

  return data.access_token;
}

/**
 * Handle a forwarded Alexa.Authorization / AcceptGrant directive.
 * Identifies the user via the grantee token (AdhanNow-issued skill access token).
 */
async function handleAcceptGrant(pool, directive) {
  console.log('[AG] handleAcceptGrant entered');                                  // ← 1
  const payload = directive?.payload || {};
  const code = payload?.grant?.code;
  const granteeToken = payload?.grantee?.token;
  console.log('[AG] code present:', !!code, '| grantee present:', !!granteeToken); // ← 2

  if (!code) { const e = new Error('AcceptGrant missing grant.code.'); e.status = 400; throw e; }
  if (!granteeToken) { const e = new Error('AcceptGrant missing grantee.token.'); e.status = 400; throw e; }

  const { authenticateAlexaSkillAccessToken } = require('./alexaOauth');
  const auth = await authenticateAlexaSkillAccessToken(pool, granteeToken);
  console.log('[AG] grantee resolved to userId:', auth?.userId || 'NULL');        // ← 3

  if (!auth?.userId) { const e = new Error('AcceptGrant grantee token did not match a linked user.'); e.status = 401; throw e; }

  const creds = getMessagingCredentials();
  console.log('[AG] messaging creds configured:', creds.configured);              // ← 4

  await exchangeAcceptGrantCode(pool, auth.userId, code);
  console.log('[AG] token stored for user:', auth.userId);                        // ← 5
  return { ok: true, userId: auth.userId };
}

/**
 * Send the virtual prayer DoorbellPress to the Event Gateway using the
 * correct async-event token. This is what actually rings the doorbell and
 * fires the user's Alexa Routine.
 */
async function sendDoorbellEvent(pool, userId, endpointId) {

  console.log("[EG] sendDoorbellEvent called");
  console.log("[EG] target user:", userId);
  const { VIRTUAL_DOORBELL_ID } = require('./alexaProactiveEvents');
  const token = await getValidAccessToken(pool, userId);
  const endpoint = endpointId || VIRTUAL_DOORBELL_ID;

  const body = {
    context: {},
    event: {
      header: {
        namespace: 'Alexa.DoorbellEventSource',
        name: 'DoorbellPress',
        messageId: `adhannow-${userId}-${Date.now()}`,
        payloadVersion: '3',
      },
      endpoint: {
        scope: { type: 'BearerToken', token },
        endpointId: endpoint,
      },
      payload: {
        cause: { type: 'PHYSICAL_INTERACTION' },
        timestamp: new Date().toISOString(),
      },
    },
  };

  const resp = await fetch(getEventGatewayUrl(), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    const err = new Error(`Event Gateway DoorbellPress failed: ${resp.status} ${text}`);
    err.status = resp.status;
    throw err;
  }

  return { ok: true };
}

async function hasAsyncGrant(pool, userId) {
  console.log("[EG] hasAsyncGrant checking user:", userId);

  const row = await getStoredTokenRow(pool, userId);

  console.log("[EG] token row exists:", !!row);

  if (row) {
    console.log("[EG] expires:", row.expires_at);
    console.log("[EG] revoked:", row.revoked_at);
    console.log("[EG] has access token:", !!row.access_token);
  }
  const row = await getStoredTokenRow(pool, userId);
  return !!(row && !row.revoked_at && row.access_token);
}

module.exports = {
  getMessagingCredentials,
  getEventGatewayUrl,
  exchangeAcceptGrantCode,
  getValidAccessToken,
  handleAcceptGrant,
  sendDoorbellEvent,
  hasAsyncGrant,
};
