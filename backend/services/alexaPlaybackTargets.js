const { sql } = require('../db/sql');

const PRAYERS = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];
const ROOM_KEYWORDS = [
  ['kitchen', 'Kitchen'],
  ['living', 'Living Room'],
  ['bedroom', 'Bedroom'],
  ['upstairs', 'Upstairs'],
  ['downstairs', 'Downstairs'],
  ['office', 'Office'],
  ['garage', 'Garage'],
  ['basement', 'Basement'],
  ['family', 'Family Room'],
  ['dining', 'Dining Room'],
];

function normalizeId(value) {
  return String(value || '').trim();
}

function inferAlexaDeviceFamily(deviceName, platform) {
  const haystack = `${String(deviceName || '')} ${String(platform || '')}`.toLowerCase();
  if (/fire\s*tv|firetv|fire\s*stick|firestick/.test(haystack)) return 'fire_tv';
  if (/echo\s*show/.test(haystack)) return 'echo_show';
  if (/echo|dot|studio|spot|pop|tap|input|auto/.test(haystack)) return 'echo';
  if (/tv/.test(haystack)) return 'tv';
  return 'unknown';
}

function endpointIdForDevice(deviceId) {
  return `device:${normalizeId(deviceId)}`;
}

function endpointIdForRoom(roomKey) {
  return `group:room:${normalizeId(roomKey).toLowerCase()}`;
}

function groupDefinitions(devices = []) {
  const enabledDevices = devices.filter((d) => String(d.platform || '').toLowerCase() === 'alexa');
  const defs = [];
  if (enabledDevices.length > 0) {
    defs.push({
      endpointId: 'group:whole-house',
      friendlyName: 'Whole House',
      endpointKind: 'group',
      deviceFamily: 'mixed',
      supportsAudio: true,
      supportsFireTv: enabledDevices.some((d) => inferAlexaDeviceFamily(d.name, d.platform) === 'fire_tv'),
      metadata: { rule: 'all_devices', recommended: true },
      sortOrder: 10,
    });
  }
  if (enabledDevices.some((d) => ['echo', 'echo_show'].includes(inferAlexaDeviceFamily(d.name, d.platform)))) {
    defs.push({
      endpointId: 'group:echo-speakers',
      friendlyName: 'All Echo Speakers',
      endpointKind: 'group',
      deviceFamily: 'echo',
      supportsAudio: true,
      supportsFireTv: false,
      metadata: { rule: 'echo_devices', recommended: true },
      sortOrder: 20,
    });
  }
  if (enabledDevices.some((d) => inferAlexaDeviceFamily(d.name, d.platform) === 'fire_tv')) {
    defs.push({
      endpointId: 'group:fire-tv',
      friendlyName: 'All Fire TV Devices',
      endpointKind: 'group',
      deviceFamily: 'fire_tv',
      supportsAudio: true,
      supportsFireTv: true,
      metadata: { rule: 'fire_tv', recommended: true },
      sortOrder: 30,
    });
  }

  const byRoom = new Map();
  for (const device of enabledDevices) {
    const haystack = `${String(device.name || '')} ${String(device.platform || '')}`.toLowerCase();
    for (const [key, label] of ROOM_KEYWORDS) {
      if (!haystack.includes(key)) continue;
      const entry = byRoom.get(key) || { key, label, items: [] };
      entry.items.push(device);
      byRoom.set(key, entry);
    }
  }
  for (const entry of byRoom.values()) {
    defs.push({
      endpointId: endpointIdForRoom(entry.key),
      friendlyName: `${entry.label} Target`,
      endpointKind: 'group',
      deviceFamily: entry.items.some((d) => inferAlexaDeviceFamily(d.name, d.platform) === 'fire_tv') ? 'mixed' : 'echo',
      supportsAudio: true,
      supportsFireTv: entry.items.some((d) => inferAlexaDeviceFamily(d.name, d.platform) === 'fire_tv'),
      metadata: { rule: 'room_keyword', room: entry.key, memberCount: entry.items.length },
      sortOrder: 40,
    });
  }
  return defs;
}

async function upsertCustomerEndpoint(pool, userId, endpoint) {
  await pool
    .request()
    .input('user_id', sql.UniqueIdentifier, userId)
    .input('endpoint_id', sql.NVarChar(255), endpoint.endpointId)
    .input('friendly_name', sql.NVarChar(255), endpoint.friendlyName)
    .input('endpoint_kind', sql.NVarChar(40), endpoint.endpointKind || 'device')
    .input('device_family', sql.NVarChar(40), endpoint.deviceFamily || 'unknown')
    .input('device_id', sql.NVarChar(255), endpoint.deviceId || null)
    .input('supports_audio', sql.Bit, endpoint.supportsAudio === false ? 0 : 1)
    .input('supports_fire_tv', sql.Bit, endpoint.supportsFireTv ? 1 : 0)
    .input('source', sql.NVarChar(40), endpoint.source || 'derived')
    .input('metadata_json', sql.NVarChar(sql.MAX), endpoint.metadata ? JSON.stringify(endpoint.metadata) : null)
    .input('sort_order', sql.Int, Number(endpoint.sortOrder || 100))
    .query(`
      MERGE dbo.alexa_customer_endpoints AS target
      USING (SELECT @user_id AS user_id, @endpoint_id AS endpoint_id) AS src
      ON target.user_id = src.user_id AND target.endpoint_id = src.endpoint_id
      WHEN MATCHED THEN
        UPDATE SET
          friendly_name = @friendly_name,
          endpoint_kind = @endpoint_kind,
          device_family = @device_family,
          device_id = @device_id,
          supports_audio = @supports_audio,
          supports_fire_tv = @supports_fire_tv,
          source = @source,
          metadata_json = @metadata_json,
          sort_order = @sort_order,
          is_enabled = 1,
          last_seen_at = SYSUTCDATETIME(),
          updated_at = SYSUTCDATETIME()
      WHEN NOT MATCHED THEN
        INSERT (
          user_id, endpoint_id, friendly_name, endpoint_kind, device_family, device_id,
          supports_audio, supports_fire_tv, source, metadata_json, sort_order, is_enabled,
          last_seen_at, created_at, updated_at
        )
        VALUES (
          @user_id, @endpoint_id, @friendly_name, @endpoint_kind, @device_family, @device_id,
          @supports_audio, @supports_fire_tv, @source, @metadata_json, @sort_order, 1,
          SYSUTCDATETIME(), SYSUTCDATETIME(), SYSUTCDATETIME()
        );
    `);
}

async function listAlexaCustomerEndpoints(pool, userId, opts = {}) {
  const onlyEnabled = opts.onlyEnabled !== false;
  const result = await pool
    .request()
    .input('user_id', sql.UniqueIdentifier, userId)
    .query(`
      SELECT endpoint_id, friendly_name, endpoint_kind, device_family, device_id,
             supports_audio, supports_fire_tv, source, metadata_json,
             sort_order, is_enabled, last_seen_at
      FROM dbo.alexa_customer_endpoints
      WHERE user_id = @user_id ${onlyEnabled ? 'AND COALESCE(is_enabled,1)=1' : ''}
      ORDER BY sort_order ASC, friendly_name ASC
    `);

  return (result.recordset || []).map((row) => {
    let metadata = null;
    try { metadata = row.metadata_json ? JSON.parse(row.metadata_json) : null; } catch { metadata = null; }
    return {
      endpointId: row.endpoint_id,
      friendlyName: row.friendly_name,
      endpointKind: row.endpoint_kind || 'device',
      deviceFamily: row.device_family || 'unknown',
      deviceId: row.device_id || null,
      supportsAudio: row.supports_audio !== false,
      supportsFireTv: row.supports_fire_tv === true,
      source: row.source || 'derived',
      metadata,
      enabled: row.is_enabled !== false,
      lastSeenAt: row.last_seen_at ? new Date(row.last_seen_at).toISOString() : null,
    };
  });
}

async function syncAlexaCustomerEndpoints(pool, userId) {
  const devicesResult = await pool
    .request()
    .input('user_id', sql.UniqueIdentifier, userId)
    .query(`
      SELECT device_id, device_name AS name, platform,
             COALESCE(device_family, 'unknown') AS device_family,
             COALESCE(enabled, 1) AS enabled
      FROM dbo.devices
      WHERE user_id = @user_id AND platform = 'alexa' AND COALESCE(enabled, 1) = 1
    `);

  const devices = Array.isArray(devicesResult.recordset) ? devicesResult.recordset : [];
  const activeEndpointIds = [];

  for (const device of devices) {
    const deviceId = normalizeId(device.device_id);
    if (!deviceId) continue;
    const family = device.device_family || inferAlexaDeviceFamily(device.name, device.platform);
    const endpoint = {
      endpointId: endpointIdForDevice(deviceId),
      friendlyName: String(device.name || `Alexa device • ${deviceId.slice(-6)}`),
      endpointKind: 'device',
      deviceFamily: family,
      deviceId,
      supportsAudio: true,
      supportsFireTv: family === 'fire_tv',
      source: 'seen_device',
      metadata: { deviceId, platform: device.platform || 'alexa' },
      sortOrder: 100,
    };
    await upsertCustomerEndpoint(pool, userId, endpoint);
    activeEndpointIds.push(endpoint.endpointId);
  }

  for (const group of groupDefinitions(devices)) {
    await upsertCustomerEndpoint(pool, userId, { ...group, source: 'derived_group' });
    activeEndpointIds.push(group.endpointId);
  }

  await pool
    .request()
    .input('user_id', sql.UniqueIdentifier, userId)
    .input('active_json', sql.NVarChar(sql.MAX), JSON.stringify(activeEndpointIds))
    .query(`
      UPDATE dbo.alexa_customer_endpoints
      SET is_enabled = CASE WHEN endpoint_id IN (SELECT value FROM OPENJSON(@active_json)) THEN 1 ELSE 0 END,
          updated_at = SYSUTCDATETIME()
      WHERE user_id = @user_id
    `);

  return listAlexaCustomerEndpoints(pool, userId);
}

async function getSelectedAlexaTargetEndpointIds(pool, userId) {
  const result = await pool
    .request()
    .input('user_id', sql.UniqueIdentifier, userId)
    .query(`
      SELECT endpoint_id
      FROM dbo.alexa_playback_target_selections
      WHERE user_id = @user_id AND COALESCE(enabled,1)=1
      ORDER BY created_at ASC
    `);
  return (result.recordset || []).map((row) => String(row.endpoint_id || '').trim()).filter(Boolean);
}

async function replaceSelectedAlexaTargetEndpointIds(pool, userId, endpointIds) {
  const ids = [...new Set((Array.isArray(endpointIds) ? endpointIds : []).map((v) => String(v || '').trim()).filter(Boolean))];
  const valid = await listAlexaCustomerEndpoints(pool, userId);
  const validSet = new Set(valid.map((item) => item.endpointId));
  const filtered = ids.filter((id) => validSet.has(id));
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    await new sql.Request(tx).input('user_id', sql.UniqueIdentifier, userId).query(`DELETE FROM dbo.alexa_playback_target_selections WHERE user_id = @user_id`);
    for (const endpointId of filtered) {
      await new sql.Request(tx)
        .input('user_id', sql.UniqueIdentifier, userId)
        .input('endpoint_id', sql.NVarChar(255), endpointId)
        .input('enabled', sql.Bit, 1)
        .query(`INSERT INTO dbo.alexa_playback_target_selections (user_id, endpoint_id, enabled) VALUES (@user_id, @endpoint_id, @enabled)`);
    }
    await tx.commit();
    return filtered;
  } catch (err) {
    await tx.rollback();
    throw err;
  }
}

async function getPrayerTargetEndpointMap(pool, userId) {
  const result = await pool.request().input('user_id', sql.UniqueIdentifier, userId).query(`
    SELECT prayer_name, endpoint_id
    FROM dbo.alexa_prayer_target_selections
    WHERE user_id = @user_id AND COALESCE(enabled,1)=1
    ORDER BY prayer_name ASC, created_at ASC
  `);
  const out = {};
  for (const row of result.recordset || []) {
    const prayer = String(row.prayer_name || '').trim().toLowerCase();
    const endpointId = String(row.endpoint_id || '').trim();
    if (!PRAYERS.includes(prayer) || !endpointId) continue;
    if (!out[prayer]) out[prayer] = [];
    out[prayer].push(endpointId);
  }
  return out;
}

async function replacePrayerTargetEndpointMap(pool, userId, selections) {
  const valid = await listAlexaCustomerEndpoints(pool, userId);
  const validSet = new Set(valid.map((item) => item.endpointId));
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    await new sql.Request(tx).input('user_id', sql.UniqueIdentifier, userId).query(`DELETE FROM dbo.alexa_prayer_target_selections WHERE user_id = @user_id`);
    const normalized = {};
    const src = selections && typeof selections === 'object' ? selections : {};
    for (const prayer of PRAYERS) {
      const ids = [...new Set((Array.isArray(src[prayer]) ? src[prayer] : src[prayer] ? [src[prayer]] : []).map((v) => String(v || '').trim()).filter((id) => validSet.has(id)))];
      normalized[prayer] = ids;
      for (const endpointId of ids) {
        await new sql.Request(tx)
          .input('user_id', sql.UniqueIdentifier, userId)
          .input('prayer_name', sql.NVarChar(20), prayer)
          .input('endpoint_id', sql.NVarChar(255), endpointId)
          .input('enabled', sql.Bit, 1)
          .query(`INSERT INTO dbo.alexa_prayer_target_selections (user_id, prayer_name, endpoint_id, enabled) VALUES (@user_id, @prayer_name, @endpoint_id, @enabled)`);
      }
    }
    await tx.commit();
    return normalized;
  } catch (err) { await tx.rollback(); throw err; }
}

function endpointMatchesDevice(endpoint, deviceId, deviceFamily, deviceName) {
  const endpointId = String(endpoint?.endpointId || '');
  const kind = String(endpoint?.endpointKind || '');
  const family = String(deviceFamily || '').toLowerCase();
  const normalizedDeviceId = normalizeId(deviceId);
  if (!endpointId) return false;
  if (kind === 'device') return String(endpoint?.deviceId || '').trim() === normalizedDeviceId;
  if (endpointId === 'group:whole-house') return !!normalizedDeviceId;
  if (endpointId === 'group:echo-speakers') return family === 'echo' || family === 'echo_show';
  if (endpointId === 'group:fire-tv') return family === 'fire_tv';
  const room = endpoint?.metadata?.room ? String(endpoint.metadata.room).toLowerCase() : '';
  if (room) {
    const name = String(endpoint?.metadata?.deviceName || endpoint?.friendlyName || '').toLowerCase();
    const currentName = String(deviceName || '').toLowerCase();
    return !!normalizedDeviceId && currentName.includes(room);
  }
  return false;
}

function findMatchingSelectedEndpoints(selectedEndpoints, deviceId, deviceFamily, deviceName) {
  const list = Array.isArray(selectedEndpoints) ? selectedEndpoints : [];
  return list.filter((endpoint) => endpointMatchesDevice(endpoint, deviceId, deviceFamily, deviceName));
}

module.exports = {
  PRAYERS,
  inferAlexaDeviceFamily,
  endpointIdForDevice,
  syncAlexaCustomerEndpoints,
  listAlexaCustomerEndpoints,
  getSelectedAlexaTargetEndpointIds,
  replaceSelectedAlexaTargetEndpointIds,
  getPrayerTargetEndpointMap,
  replacePrayerTargetEndpointMap,
  findMatchingSelectedEndpoints,
};
