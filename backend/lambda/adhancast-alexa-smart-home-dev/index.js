// adhancast-alexa-smart-home-dev\index.js
const API_BASE = String(process.env.API_BASE_URL || process.env.BACKEND_BASE_URL || '').replace(/\/+$/, '');
const REQUEST_TIMEOUT_MS = 7000;

function getAccessToken(event) {
  return event?.directive?.endpoint?.scope?.token || event?.directive?.payload?.scope?.token || '';
}

function getHeader(event) {
  return event?.directive?.header || {};
}

function buildErrorResponse(event, type = 'INTERNAL_ERROR', message = 'Smart Home request failed.') {
  return {
    event: {
      header: {
        namespace: 'Alexa',
        name: 'ErrorResponse',
        payloadVersion: '3',
        messageId: getHeader(event).messageId || `err-${Date.now()}`,
        correlationToken: getHeader(event).correlationToken,
      },
      endpoint: event?.directive?.endpoint,
      payload: { type, message },
    },
  };
}

async function requestJson(method, path, accessToken, body) {
  if (!API_BASE) throw new Error('API_BASE_URL or BACKEND_BASE_URL is not configured.');
  const headers = { Accept: 'application/json', Authorization: `Bearer ${accessToken}` };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const text = await response.text();
    let json = {};
    try { json = text ? JSON.parse(text) : {}; } catch { json = {}; }
    if (!response.ok) {
      const err = new Error(json?.error || json?.message || text || `HTTP ${response.status}`);
      err.statusCode = response.status;
      throw err;
    }
    return json || {};
  } finally {
    clearTimeout(timeout);
  }
}

function buildResponse(event, name, payload = {}, properties = []) {
  const header = getHeader(event);
  return {
    context: properties.length ? { properties } : undefined,
    event: {
      header: {
        namespace: 'Alexa',
        name,
        payloadVersion: '3',
        messageId: header.messageId || `msg-${Date.now()}`,
        correlationToken: header.correlationToken,
      },
      endpoint: event?.directive?.endpoint,
      payload,
    },
  };
}

exports.handler = async (event) => {
  try {
    const directive = event?.directive || {};
    const header = directive.header || {};

    // ── INSTRUMENTATION ──
    console.log('[SH] directive received:', JSON.stringify({
      namespace: header.namespace,
      name: header.name,
      hasGrantCode: !!directive?.payload?.grant?.code,
      hasGranteeToken: !!directive?.payload?.grantee?.token,
    }));
    // ─────────────────────
    // AcceptGrant carries its credentials at payload.grantee.token (not the
    // endpoint scope), so it must be handled before the access-token check below.
    // Forward the FULL directive — preserving payload.grant.code and
    // payload.grantee.token — to the backend, which exchanges the code for the
    // alexa::async_event:write token used to ring the prayer doorbell.
    if (header.namespace === 'Alexa.Authorization' && header.name === 'AcceptGrant') {
      console.log('[SH] AcceptGrant branch entered — forwarding to backend');   // ← ADD
      try {
        const data = await requestJson('POST', '/api/alexa/smart-home/accept-grant', '', { directive });
        console.log('[SH] accept-grant backend responded OK');                   // ← ADD
        // ...existing return...
        if (data?.event?.header?.name === 'AcceptGrant.Response') {
          return data;
        }
        return {
          event: {
            header: {
              namespace: 'Alexa.Authorization',
              name: 'AcceptGrant.Response',
              payloadVersion: '3',
              messageId: header.messageId || `grant-${Date.now()}`,
            },
            payload: {},
          },
        };
      } catch (err) {
        console.error('AcceptGrant forward failed:', err);
        return {
          event: {
            header: {
              namespace: 'Alexa.Authorization',
              name: 'ErrorResponse',
              payloadVersion: '3',
              messageId: header.messageId || `grant-err-${Date.now()}`,
            },
            payload: {
              type: 'ACCEPT_GRANT_FAILED',
              message: String(err?.message || 'Failed to store AcceptGrant.'),
            },
          },
        };
      }
    }

    const accessToken = getAccessToken(event);
    if (!accessToken) {
      return buildErrorResponse(event, 'INVALID_AUTHORIZATION_CREDENTIAL', 'Missing smart-home access token.');
    }

    if (header.namespace === 'Alexa.Discovery' && header.name === 'Discover') {
      const data = await requestJson('GET', '/api/alexa/smart-home/discovery', accessToken);
      return {
        event: {
          header: {
            namespace: 'Alexa.Discovery',
            name: 'Discover.Response',
            payloadVersion: '3',
            messageId: header.messageId || `discover-${Date.now()}`,
          },
          payload: { endpoints: Array.isArray(data?.endpoints) ? data.endpoints : [] },
        },
      };
    }

    if (header.name === 'ReportState') {
      const endpointId = directive?.endpoint?.endpointId;
      const data = await requestJson('GET', `/api/alexa/smart-home/state?endpointId=${encodeURIComponent(endpointId)}`, accessToken);
      return buildResponse(event, 'StateReport', {}, Array.isArray(data?.properties) ? data.properties : []);
    }

    const data = await requestJson('POST', '/api/alexa/smart-home/directive', accessToken, { directive });
    return buildResponse(event, 'Response', {}, Array.isArray(data?.context?.properties) ? data.context.properties : []);
  } catch (err) {
    console.error('Smart Home Lambda error:', err);
    if (Number(err?.statusCode || 0) === 401) {
      return buildErrorResponse(event, 'INVALID_AUTHORIZATION_CREDENTIAL', 'Please relink your AdhanCast account for the Smart Home skill.');
    }
    return buildErrorResponse(event, 'INTERNAL_ERROR', err?.message || 'Smart Home request failed.');
  }
};