const crypto = require('crypto');
const { sql } = require('../db/sql');

function normalizeText(value) {
  return String(value || '').trim();
}

function splitCsv(value) {
  return String(value || '')
    .split(',')
    .map((x) => normalizeText(x))
    .filter(Boolean);
}

function unique(values) {
  return [...new Set((values || []).filter(Boolean))];
}

function normalizeRedirectUri(value) {
  const raw = normalizeText(value);
  if (!raw) return '';
  try {
    return new URL(raw).toString();
  } catch {
    return '';
  }
}

function getDefaultAlexaOauthScope() {
  return normalizeText(process.env.ALEXA_OAUTH_SCOPE) || 'alexa';
}

function getAlexaOauthConfig() {
  const clientId =
    normalizeText(process.env.ALEXA_OAUTH_CLIENT_ID) ||
    normalizeText(process.env.ALEXA_SKILL_CLIENT_ID);
  const clientSecret =
    normalizeText(process.env.ALEXA_OAUTH_CLIENT_SECRET) ||
    normalizeText(process.env.ALEXA_SKILL_CLIENT_SECRET);
  const redirectUris = unique([
    ...splitCsv(process.env.ALEXA_OAUTH_REDIRECT_URIS || process.env.ALEXA_SKILL_REDIRECT_URI),
    ...splitCsv(process.env.ALEXA_APP_LINK_REDIRECT_URIS),
  ])
    .map(normalizeRedirectUri)
    .filter(Boolean);

  const accessTokenTtlSec = Math.max(
    300,
    Number(process.env.ALEXA_SKILL_ACCESS_TOKEN_TTL_SEC || 3600) || 3600
  );

  const authCodeTtlSec = Math.max(
    60,
    Number(process.env.ALEXA_SKILL_AUTH_CODE_TTL_SEC || 300) || 300
  );

  return {
    clientId,
    clientSecret,
    redirectUris,
    accessTokenTtlSec,
    authCodeTtlSec,
    configured: !!clientId && !!clientSecret && redirectUris.length > 0,
  };
}

function assertConfigured() {
  const config = getAlexaOauthConfig();
  if (!config.configured) {
    const err = new Error(
      'Alexa account linking is not configured. Set ALEXA_OAUTH_CLIENT_ID, ALEXA_OAUTH_CLIENT_SECRET, and ALEXA_OAUTH_REDIRECT_URIS.'
    );
    err.status = 500;
    throw err;
  }
  return config;
}

function hashToken(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function createOpaqueToken(prefix) {
  return `${prefix}_${crypto.randomBytes(32).toString('hex')}`;
}

function tokenPrefix(value) {
  return String(value || '').slice(0, 20);
}

function validateClient(clientId, redirectUri) {
  const config = assertConfigured();
  if (normalizeText(clientId) !== config.clientId) {
    const err = new Error('Invalid Alexa OAuth client_id.');
    err.status = 400;
    throw err;
  }

  const normalizedRedirect = normalizeRedirectUri(redirectUri);
  if (!normalizedRedirect || !config.redirectUris.includes(normalizedRedirect)) {
    const err = new Error('redirect_uri is not allowed for Alexa account linking.');
    err.status = 400;
    throw err;
  }

  return { ...config, redirectUri: normalizedRedirect };
}

function validateClientSecret(clientId, clientSecret) {
  const config = assertConfigured();
  if (normalizeText(clientId) !== config.clientId) {
    const err = new Error('Invalid OAuth client_id.');
    err.status = 401;
    throw err;
  }

  if (normalizeText(clientSecret) !== config.clientSecret) {
    const err = new Error('Invalid OAuth client_secret.');
    err.status = 401;
    throw err;
  }

  return config;
}

async function createAlexaAuthorizationCode(pool, params) {
  const { userId, clientId, redirectUri, scope } = params;
  const config = validateClient(clientId, redirectUri);
  const code = createOpaqueToken('athc');
  const expiresAt = new Date(Date.now() + config.authCodeTtlSec * 1000);

  await pool
    .request()
    .input('auth_code_hash', sql.NVarChar(128), hashToken(code))
    .input('auth_code_prefix', sql.NVarChar(24), tokenPrefix(code))
    .input('user_id', sql.UniqueIdentifier, userId)
    .input('client_id', sql.NVarChar(255), config.clientId)
    .input('redirect_uri', sql.NVarChar(1000), config.redirectUri)
    .input('scope', sql.NVarChar(255), normalizeText(scope) || getDefaultAlexaOauthScope())
    .input('expires_at', sql.DateTime2, expiresAt)
    .query(`
      INSERT INTO dbo.alexa_skill_authorization_codes (
        auth_code_hash,
        auth_code_prefix,
        user_id,
        client_id,
        redirect_uri,
        scope,
        expires_at
      )
      VALUES (
        @auth_code_hash,
        @auth_code_prefix,
        @user_id,
        @client_id,
        @redirect_uri,
        @scope,
        @expires_at
      )
    `);

  return {
    code,
    expiresAt,
    scope: normalizeText(scope) || getDefaultAlexaOauthScope(),
  };
}

async function insertAlexaTokens(tx, params) {
  const { userId, clientId, scope, alexaUserId } = params;
  const config = assertConfigured();
  const accessToken = createOpaqueToken('atk');
  const refreshToken = createOpaqueToken('rtk');
  const expiresAt = new Date(Date.now() + config.accessTokenTtlSec * 1000);

  const insert = await new sql.Request(tx)
    .input('user_id', sql.UniqueIdentifier, userId)
    .input('client_id', sql.NVarChar(255), clientId)
    .input('scope', sql.NVarChar(255), normalizeText(scope) || getDefaultAlexaOauthScope())
    .input('access_token_hash', sql.NVarChar(128), hashToken(accessToken))
    .input('access_token_prefix', sql.NVarChar(24), tokenPrefix(accessToken))
    .input('refresh_token_hash', sql.NVarChar(128), hashToken(refreshToken))
    .input('refresh_token_prefix', sql.NVarChar(24), tokenPrefix(refreshToken))
    .input('alexa_user_id', sql.NVarChar(255), normalizeText(alexaUserId) || null)
    .input('expires_at', sql.DateTime2, expiresAt)
    .query(`
      INSERT INTO dbo.alexa_skill_tokens (
        user_id,
        client_id,
        scope,
        access_token_hash,
        access_token_prefix,
        refresh_token_hash,
        refresh_token_prefix,
        alexa_user_id,
        expires_at
      )
      OUTPUT inserted.id AS id
      VALUES (
        @user_id,
        @client_id,
        @scope,
        @access_token_hash,
        @access_token_prefix,
        @refresh_token_hash,
        @refresh_token_prefix,
        @alexa_user_id,
        @expires_at
      )
    `);

  return {
    tokenId: insert.recordset[0]?.id || null,
    accessToken,
    refreshToken,
    expiresAt,
    expiresIn: config.accessTokenTtlSec,
    scope: normalizeText(scope) || getDefaultAlexaOauthScope(),
    tokenType: 'Bearer',
  };
}

async function exchangeAlexaAuthorizationCode(pool, params) {
  const clientId = normalizeText(params.clientId);
  const clientSecret = normalizeText(params.clientSecret);
  const code = normalizeText(params.code);
  const redirectUri = normalizeText(params.redirectUri);
  const normalizedIncomingRedirect = normalizeRedirectUri(redirectUri);

  validateClientSecret(clientId, clientSecret);

  if (!code) {
    const err = new Error('Missing authorization code.');
    err.status = 400;
    throw err;
  }

  const tx = new sql.Transaction(pool);
  await tx.begin();

  try {
    const authCodeResult = await new sql.Request(tx)
      .input('auth_code_hash', sql.NVarChar(128), hashToken(code))
      .query(`
        SELECT TOP 1 id, user_id, client_id, redirect_uri, scope, expires_at, consumed_at
        FROM dbo.alexa_skill_authorization_codes
        WHERE auth_code_hash = @auth_code_hash
      `);

    const row = authCodeResult.recordset[0];
    if (!row) {
      const err = new Error('Authorization code is invalid.');
      err.status = 400;
      throw err;
    }

    if (row.consumed_at) {
      const err = new Error('Authorization code has already been used.');
      err.status = 400;
      throw err;
    }

    if (new Date(row.expires_at).getTime() <= Date.now()) {
      const err = new Error('Authorization code has expired.');
      err.status = 400;
      throw err;
    }

    if (normalizeText(row.client_id) !== clientId) {
      const err = new Error('Authorization code client mismatch.');
      err.status = 400;
      throw err;
    }

    const storedRedirect = normalizeRedirectUri(row.redirect_uri);
    if (normalizedIncomingRedirect && storedRedirect !== normalizedIncomingRedirect) {
      const err = new Error('Authorization code redirect URI mismatch.');
      err.status = 400;
      throw err;
    }

    await new sql.Request(tx)
      .input('id', sql.UniqueIdentifier, row.id)
      .query(`
        UPDATE dbo.alexa_skill_authorization_codes
        SET consumed_at = SYSUTCDATETIME()
        WHERE id = @id
      `);

    const tokenSet = await insertAlexaTokens(tx, {
      userId: row.user_id,
      clientId,
      scope: row.scope,
    });

    await tx.commit();
    return tokenSet;
  } catch (err) {
    await tx.rollback();
    throw err;
  }
}

async function refreshAlexaAccessToken(pool, params) {
  const clientId = normalizeText(params.clientId);
  const clientSecret = normalizeText(params.clientSecret);
  const refreshToken = normalizeText(params.refreshToken);

  validateClientSecret(clientId, clientSecret);

  if (!refreshToken) {
    const err = new Error('Missing refresh token.');
    err.status = 400;
    throw err;
  }

  const tx = new sql.Transaction(pool);
  await tx.begin();

  try {
    const current = await new sql.Request(tx)
      .input('refresh_token_hash', sql.NVarChar(128), hashToken(refreshToken))
      .query(`
        SELECT TOP 1 id, user_id, client_id, scope, revoked_at
        FROM dbo.alexa_skill_tokens
        WHERE refresh_token_hash = @refresh_token_hash
      `);

    const row = current.recordset[0];
    if (!row || row.revoked_at) {
      const err = new Error('Refresh token is invalid.');
      err.status = 401;
      throw err;
    }

    if (normalizeText(row.client_id) !== clientId) {
      const err = new Error('Refresh token client mismatch.');
      err.status = 401;
      throw err;
    }

    await new sql.Request(tx)
      .input('id', sql.UniqueIdentifier, row.id)
      .query(`
        UPDATE dbo.alexa_skill_tokens
        SET revoked_at = SYSUTCDATETIME(), updated_at = SYSUTCDATETIME()
        WHERE id = @id
      `);

    const tokenSet = await insertAlexaTokens(tx, {
      userId: row.user_id,
      clientId,
      scope: row.scope,
    });

    await tx.commit();
    return tokenSet;
  } catch (err) {
    await tx.rollback();
    throw err;
  }
}

async function getAlexaSkillLinkStatus(pool, userId) {
  const result = await pool
    .request()
    .input('user_id', sql.UniqueIdentifier, userId)
    .query(`
      SELECT TOP 1 id, client_id, scope, alexa_user_id, expires_at, revoked_at, created_at, last_used_at
      FROM dbo.alexa_skill_tokens
      WHERE user_id = @user_id
      ORDER BY created_at DESC
    `);

  const row = result.recordset[0];
  if (!row) {
    return {
      linked: false,
      latestTokenCreatedAt: null,
      expiresAt: null,
      lastUsedAt: null,
      alexaUserId: null,
    };
  }

  const now = Date.now();
  const expiresAt = row.expires_at ? new Date(row.expires_at).toISOString() : null;
  const revoked = !!row.revoked_at;
  const active = !revoked && row.expires_at && new Date(row.expires_at).getTime() > now;

  return {
    linked: !!active,
    latestTokenCreatedAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    expiresAt,
    lastUsedAt: row.last_used_at ? new Date(row.last_used_at).toISOString() : null,
    alexaUserId: row.alexa_user_id || null,
    clientId: row.client_id || null,
    revoked,
  };
}

async function revokeAlexaSkillTokensForUser(pool, userId) {
  await pool
    .request()
    .input('user_id', sql.UniqueIdentifier, userId)
    .query(`
      UPDATE dbo.alexa_skill_tokens
      SET revoked_at = SYSUTCDATETIME(), updated_at = SYSUTCDATETIME()
      WHERE user_id = @user_id AND revoked_at IS NULL
    `);
}


async function upsertAlexaAppLinkToken(pool, params) {
  const {
    userId,
    amazonAccessToken,
    amazonRefreshToken,
    amazonScope,
    endpointHost,
    customerUserId,
    expiresAt,
  } = params;

  await pool
    .request()
    .input('user_id', sql.UniqueIdentifier, userId)
    .input('amazon_access_token', sql.NVarChar(sql.MAX), normalizeText(amazonAccessToken) || null)
    .input('amazon_refresh_token', sql.NVarChar(sql.MAX), normalizeText(amazonRefreshToken) || null)
    .input('amazon_scope', sql.NVarChar(1000), normalizeText(amazonScope) || null)
    .input('endpoint_host', sql.NVarChar(255), normalizeText(endpointHost) || null)
    .input('customer_user_id', sql.NVarChar(255), normalizeText(customerUserId) || null)
    .input('expires_at', sql.DateTime2, expiresAt || null)
    .query(`
      MERGE dbo.alexa_app_link_tokens AS target
      USING (SELECT @user_id AS user_id) AS source
      ON target.user_id = source.user_id
      WHEN MATCHED THEN
        UPDATE SET
          amazon_access_token = @amazon_access_token,
          amazon_refresh_token = COALESCE(@amazon_refresh_token, target.amazon_refresh_token),
          amazon_scope = COALESCE(@amazon_scope, target.amazon_scope),
          endpoint_host = COALESCE(@endpoint_host, target.endpoint_host),
          customer_user_id = COALESCE(@customer_user_id, target.customer_user_id),
          expires_at = @expires_at,
          revoked_at = NULL,
          updated_at = SYSUTCDATETIME()
      WHEN NOT MATCHED THEN
        INSERT (
          user_id,
          amazon_access_token,
          amazon_refresh_token,
          amazon_scope,
          endpoint_host,
          customer_user_id,
          expires_at
        )
        VALUES (
          @user_id,
          @amazon_access_token,
          @amazon_refresh_token,
          @amazon_scope,
          @endpoint_host,
          @customer_user_id,
          @expires_at
        );
    `);
}

async function getAlexaAppLinkToken(pool, userId) {
  const result = await pool
    .request()
    .input('user_id', sql.UniqueIdentifier, userId)
    .query(`
      SELECT TOP 1
        user_id,
        amazon_access_token,
        amazon_refresh_token,
        amazon_scope,
        endpoint_host,
        customer_user_id,
        expires_at,
        revoked_at,
        created_at,
        updated_at
      FROM dbo.alexa_app_link_tokens
      WHERE user_id = @user_id
    `);

  const row = result.recordset[0];
  if (!row) return null;

  return {
    userId: row.user_id,
    amazonAccessToken: row.amazon_access_token || null,
    amazonRefreshToken: row.amazon_refresh_token || null,
    amazonScope: row.amazon_scope || null,
    endpointHost: row.endpoint_host || null,
    customerUserId: row.customer_user_id || null,
    expiresAt: row.expires_at ? new Date(row.expires_at).toISOString() : null,
    revokedAt: row.revoked_at ? new Date(row.revoked_at).toISOString() : null,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
  };
}

async function revokeAlexaAppLinkTokenForUser(pool, userId) {
  await pool
    .request()
    .input('user_id', sql.UniqueIdentifier, userId)
    .query(`
      UPDATE dbo.alexa_app_link_tokens
      SET revoked_at = SYSUTCDATETIME(), updated_at = SYSUTCDATETIME()
      WHERE user_id = @user_id AND revoked_at IS NULL
    `);
}

async function authenticateAlexaSkillAccessToken(pool, accessToken) {
  const token = normalizeText(accessToken);
  if (!token) return null;

  const result = await pool
    .request()
    .input('access_token_hash', sql.NVarChar(128), hashToken(token))
    .query(`
      SELECT TOP 1 id, user_id, client_id, scope, expires_at, revoked_at, alexa_user_id
      FROM dbo.alexa_skill_tokens
      WHERE access_token_hash = @access_token_hash
    `);

  const row = result.recordset[0];
  if (!row || row.revoked_at) return null;
  if (!row.expires_at || new Date(row.expires_at).getTime() <= Date.now()) return null;

  await pool
    .request()
    .input('id', sql.UniqueIdentifier, row.id)
    .query(`
      UPDATE dbo.alexa_skill_tokens
      SET last_used_at = SYSUTCDATETIME(), updated_at = SYSUTCDATETIME()
      WHERE id = @id
    `);

  return {
    tokenId: row.id,
    userId: row.user_id,
    clientId: row.client_id,
    scope: row.scope,
    expiresAt: row.expires_at,
    alexaUserId: row.alexa_user_id || null,
  };
}

async function rememberAlexaSkillUser(pool, tokenId, alexaUserId) {
  const value = normalizeText(alexaUserId);
  if (!tokenId || !value) return;

  await pool
    .request()
    .input('id', sql.UniqueIdentifier, tokenId)
    .input('alexa_user_id', sql.NVarChar(255), value)
    .query(`
      UPDATE dbo.alexa_skill_tokens
      SET alexa_user_id = COALESCE(@alexa_user_id, alexa_user_id),
          updated_at = SYSUTCDATETIME()
      WHERE id = @id
    `);
}

module.exports = {
  getAlexaOauthConfig,
  getDefaultAlexaOauthScope,
  createAlexaAuthorizationCode,
  exchangeAlexaAuthorizationCode,
  refreshAlexaAccessToken,
  getAlexaSkillLinkStatus,
  revokeAlexaSkillTokensForUser,
  authenticateAlexaSkillAccessToken,
  rememberAlexaSkillUser,
  upsertAlexaAppLinkToken,
  getAlexaAppLinkToken,
  revokeAlexaAppLinkTokenForUser,
};
