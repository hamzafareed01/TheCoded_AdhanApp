
const { sql } = require("../db/sql");
const { listAlexaCustomerEndpoints, getSelectedAlexaTargetEndpointIds } = require('./alexaPlaybackTargets');

const DEFAULT_QUIET_DOWN_POLICY = {
  enabled: false,
  mode: "mute",
  volume: 15,
  restoreAfterAdhan: true,
  applyToSelectedDevices: true,
  includeFireTv: false,
};

const ENDPOINT_IDS = {
  automation: "adhancast:automation",
  quietMode: "adhancast:quiet-mode",
  quietVolume: "adhancast:quiet-volume",
  fireTvQuiet: "adhancast:firetv-quiet",
};

function safeParseJson(value, fallback = null) {
  if (!value) return fallback;
  if (typeof value === "object") return value;
  if (typeof value !== "string") return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function isoNow() {
  return new Date().toISOString();
}

function makeProp(namespace, name, value) {
  return {
    namespace,
    name,
    value,
    timeOfSample: isoNow(),
    uncertaintyInMilliseconds: 500,
  };
}

function normalizeBool(value, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function normalizeInt(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.trunc(n))) : fallback;
}

function parseSelectedDeviceIds(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.filter(Boolean).map(String);
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(Boolean).map(String) : [];
  } catch {
    return [];
  }
}

function parseQuietDownPolicy(profile = {}) {
  const parsed = safeParseJson(profile.quiet_down_policy_json, {}) || {};
  return {
    enabled: normalizeBool(profile.quiet_down_enabled, normalizeBool(parsed.enabled, DEFAULT_QUIET_DOWN_POLICY.enabled)),
    mode: parsed.mode === "volume" ? "volume" : DEFAULT_QUIET_DOWN_POLICY.mode,
    volume: normalizeInt(parsed.volume, DEFAULT_QUIET_DOWN_POLICY.volume),
    restoreAfterAdhan: normalizeBool(parsed.restoreAfterAdhan, DEFAULT_QUIET_DOWN_POLICY.restoreAfterAdhan),
    applyToSelectedDevices: normalizeBool(parsed.applyToSelectedDevices, DEFAULT_QUIET_DOWN_POLICY.applyToSelectedDevices),
    includeFireTv: normalizeBool(parsed.includeFireTv, DEFAULT_QUIET_DOWN_POLICY.includeFireTv),
  };
}

function serializeQuietDownPolicy(policy) {
  return JSON.stringify({
    enabled: !!policy.enabled,
    mode: policy.mode === "volume" ? "volume" : "mute",
    volume: normalizeInt(policy.volume, DEFAULT_QUIET_DOWN_POLICY.volume),
    restoreAfterAdhan: !!policy.restoreAfterAdhan,
    applyToSelectedDevices: policy.applyToSelectedDevices !== false,
    includeFireTv: !!policy.includeFireTv,
  });
}

function inferFireTvTargets(devices = []) {
  return devices.filter((device) => {
    const name = String(device.name || "").toLowerCase();
    const platform = String(device.platform || "").toLowerCase();
    return (
      name.includes("fire tv") ||
      name.includes("firetv") ||
      name.includes("fire stick") ||
      name.includes("firestick") ||
      platform.includes("firetv") ||
      platform.includes("tv")
    );
  });
}

function buildPowerControllerCapability() {
  return {
    type: "AlexaInterface",
    interface: "Alexa.PowerController",
    version: "3",
    properties: {
      supported: [{ name: "powerState" }],
      proactivelyReported: false,
      retrievable: true,
    },
  };
}

function buildSpeakerCapability() {
  return {
    type: "AlexaInterface",
    interface: "Alexa.Speaker",
    version: "3",
    properties: {
      supported: [{ name: "volume" }, { name: "muted" }],
      proactivelyReported: false,
      retrievable: true,
    },
  };
}

function buildHealthCapability() {
  return {
    type: "AlexaInterface",
    interface: "Alexa.EndpointHealth",
    version: "3",
    properties: {
      supported: [{ name: "connectivity" }],
      proactivelyReported: false,
      retrievable: true,
    },
  };
}

function buildDiscoveryEndpoints(profile = {}, devices = []) {
  const quiet = parseQuietDownPolicy(profile);
  const selectedDeviceIds = parseSelectedDeviceIds(profile.selected_alexa_device_ids_json);
  const fireTvTargets = inferFireTvTargets(devices);
  const descriptionBits = [];
  if (selectedDeviceIds.length > 0) descriptionBits.push(`${selectedDeviceIds.length} selected device${selectedDeviceIds.length === 1 ? "" : "s"}`);
  if (fireTvTargets.length > 0) descriptionBits.push(`${fireTvTargets.length} Fire TV target${fireTvTargets.length === 1 ? "" : "s"}`);

  const baseCookie = {
    selectedDeviceIds: JSON.stringify(selectedDeviceIds),
    fireTvDeviceIds: JSON.stringify(fireTvTargets.map((x) => x.device_id || x.id || x.name)),
  };

  const endpoints = [
    {
      endpointId: ENDPOINT_IDS.automation,
      manufacturerName: "AdhanCast",
      friendlyName: "AdhanCast Automation",
      description: "Turn AdhanCast prayer automation on or off.",
      displayCategories: ["SWITCH"],
      cookie: { ...baseCookie, kind: "automation" },
      capabilities: [
        { type: "AlexaInterface", interface: "Alexa", version: "3" },
        buildHealthCapability(),
        buildPowerControllerCapability(),
      ],
    },
    {
      endpointId: ENDPOINT_IDS.quietMode,
      manufacturerName: "AdhanCast",
      friendlyName: "AdhanCast Quiet Mode",
      description: `Enable or disable the saved quiet-down policy during adhan${descriptionBits.length ? ` (${descriptionBits.join(", ")})` : ""}.`,
      displayCategories: ["SWITCH"],
      cookie: { ...baseCookie, kind: "quiet-mode" },
      capabilities: [
        { type: "AlexaInterface", interface: "Alexa", version: "3" },
        buildHealthCapability(),
        buildPowerControllerCapability(),
      ],
    },
    {
      endpointId: ENDPOINT_IDS.quietVolume,
      manufacturerName: "AdhanCast",
      friendlyName: "AdhanCast Quiet Volume",
      description: quiet.mode === "mute"
        ? "Saved quiet-down volume target used when you switch from mute to reduced volume mode."
        : "Control the saved quiet-down volume target used during adhan.",
      displayCategories: ["SPEAKER"],
      cookie: { ...baseCookie, kind: "quiet-volume" },
      capabilities: [
        { type: "AlexaInterface", interface: "Alexa", version: "3" },
        buildHealthCapability(),
        buildSpeakerCapability(),
      ],
    },
  ];

  if (fireTvTargets.length > 0) {
    endpoints.push({
      endpointId: ENDPOINT_IDS.fireTvQuiet,
      manufacturerName: "AdhanCast",
      friendlyName: "AdhanCast Fire TV Quieting",
      description: "Enable or disable whether your saved quiet-down policy should include Fire TV targets in future supported integrations.",
      displayCategories: ["SWITCH"],
      cookie: { ...baseCookie, kind: "firetv-quiet" },
      capabilities: [
        { type: "AlexaInterface", interface: "Alexa", version: "3" },
        buildHealthCapability(),
        buildPowerControllerCapability(),
      ],
    });
  }

  return endpoints;
}

function buildStateForEndpoint(profile = {}, devices = [], endpointId) {
  const quiet = parseQuietDownPolicy(profile);
  const fireTvTargets = inferFireTvTargets(devices);

  const connectivity = makeProp("Alexa.EndpointHealth", "connectivity", { value: "OK" });

  if (endpointId === ENDPOINT_IDS.automation) {
    return [connectivity, makeProp("Alexa.PowerController", "powerState", profile.account_enabled ? "ON" : "OFF")];
  }

  if (endpointId === ENDPOINT_IDS.quietMode) {
    return [connectivity, makeProp("Alexa.PowerController", "powerState", quiet.enabled ? "ON" : "OFF")];
  }

  if (endpointId === ENDPOINT_IDS.quietVolume) {
    return [
      connectivity,
      makeProp("Alexa.Speaker", "volume", quiet.volume),
      makeProp("Alexa.Speaker", "muted", quiet.mode === "mute" && quiet.enabled),
    ];
  }

  if (endpointId === ENDPOINT_IDS.fireTvQuiet) {
    const enabled = quiet.enabled && quiet.includeFireTv && fireTvTargets.length > 0;
    return [connectivity, makeProp("Alexa.PowerController", "powerState", enabled ? "ON" : "OFF")];
  }

  const err = new Error(`Unsupported endpointId: ${endpointId}`);
  err.status = 404;
  throw err;
}

async function loadSmartHomeContext(pool, userId) {
  const profileResult = await pool
    .request()
    .input("user_id", sql.UniqueIdentifier, userId)
    .query(`SELECT * FROM dbo.user_profiles WHERE user_id = @user_id`);

  const devicesResult = await pool
    .request()
    .input("user_id", sql.UniqueIdentifier, userId)
    .query(`
      SELECT device_id, name, platform, enabled
      FROM dbo.devices
      WHERE user_id = @user_id
      ORDER BY created_at DESC
    `);

  return {
    profile: profileResult.recordset[0] || {},
    devices: devicesResult.recordset || [],
  };
}

async function updateQuietDownPolicy(pool, userId, nextPolicy) {
  await pool
    .request()
    .input("user_id", sql.UniqueIdentifier, userId)
    .input("quiet_down_enabled", sql.Bit, nextPolicy.enabled ? 1 : 0)
    .input("quiet_down_policy_json", sql.NVarChar(sql.MAX), serializeQuietDownPolicy(nextPolicy))
    .query(`
      UPDATE dbo.user_profiles
      SET
        quiet_down_enabled = @quiet_down_enabled,
        quiet_down_policy_json = @quiet_down_policy_json,
        updated_at = SYSUTCDATETIME()
      WHERE user_id = @user_id
    `);
}

async function appendSmartHomeLog(pool, userId, endpointId, directiveName, payload) {
  await pool
    .request()
    .input("user_id", sql.UniqueIdentifier, userId)
    .input("endpoint_id", sql.NVarChar(255), endpointId)
    .input("directive_name", sql.NVarChar(120), directiveName)
    .input("payload_json", sql.NVarChar(sql.MAX), JSON.stringify(payload || {}))
    .query(`
      INSERT INTO dbo.alexa_smart_home_log (user_id, endpoint_id, directive_name, payload_json)
      VALUES (@user_id, @endpoint_id, @directive_name, @payload_json)
    `);
}

async function handleSmartHomeDirective(pool, userId, directive) {
  const header = directive?.header || {};
  const endpointId = directive?.endpoint?.endpointId;
  const payload = directive?.payload || {};

  if (!endpointId) {
    const err = new Error("Missing endpointId for smart home directive.");
    err.status = 400;
    throw err;
  }

  const { profile, devices } = await loadSmartHomeContext(pool, userId);
  const quiet = parseQuietDownPolicy(profile);
  const name = String(header.name || "");

  if (endpointId === ENDPOINT_IDS.automation) {
    if (!["TurnOn", "TurnOff"].includes(name)) {
      const err = new Error(`Unsupported directive for ${endpointId}: ${name}`);
      err.status = 400;
      throw err;
    }

    await pool
      .request()
      .input("user_id", sql.UniqueIdentifier, userId)
      .input("account_enabled", sql.Bit, name === "TurnOn" ? 1 : 0)
      .query(`
        UPDATE dbo.user_profiles
        SET account_enabled = @account_enabled,
            updated_at = SYSUTCDATETIME()
        WHERE user_id = @user_id
      `);

    await appendSmartHomeLog(pool, userId, endpointId, name, payload);
    const updated = await loadSmartHomeContext(pool, userId);
    return {
      context: { properties: buildStateForEndpoint(updated.profile, updated.devices, endpointId) },
    };
  }

  if (endpointId === ENDPOINT_IDS.quietMode) {
    if (!["TurnOn", "TurnOff"].includes(name)) {
      const err = new Error(`Unsupported directive for ${endpointId}: ${name}`);
      err.status = 400;
      throw err;
    }

    quiet.enabled = name === "TurnOn";
    await updateQuietDownPolicy(pool, userId, quiet);
    await appendSmartHomeLog(pool, userId, endpointId, name, payload);
    const updated = await loadSmartHomeContext(pool, userId);
    return {
      context: { properties: buildStateForEndpoint(updated.profile, updated.devices, endpointId) },
    };
  }

  if (endpointId === ENDPOINT_IDS.fireTvQuiet) {
    if (!["TurnOn", "TurnOff"].includes(name)) {
      const err = new Error(`Unsupported directive for ${endpointId}: ${name}`);
      err.status = 400;
      throw err;
    }

    quiet.includeFireTv = name === "TurnOn";
    await updateQuietDownPolicy(pool, userId, quiet);
    await appendSmartHomeLog(pool, userId, endpointId, name, payload);
    const updated = await loadSmartHomeContext(pool, userId);
    return {
      context: { properties: buildStateForEndpoint(updated.profile, updated.devices, endpointId) },
    };
  }

  if (endpointId === ENDPOINT_IDS.quietVolume) {
    if (name === "SetVolume") {
      quiet.mode = "volume";
      quiet.volume = normalizeInt(payload.volume, quiet.volume);
      await updateQuietDownPolicy(pool, userId, quiet);
      await appendSmartHomeLog(pool, userId, endpointId, name, payload);
    } else if (name === "AdjustVolume") {
      quiet.mode = "volume";
      quiet.volume = normalizeInt(quiet.volume + Number(payload.volume || 0), quiet.volume);
      await updateQuietDownPolicy(pool, userId, quiet);
      await appendSmartHomeLog(pool, userId, endpointId, name, payload);
    } else if (name === "SetMute") {
      quiet.mode = payload.mute ? "mute" : "volume";
      if (payload.mute) quiet.enabled = true;
      await updateQuietDownPolicy(pool, userId, quiet);
      await appendSmartHomeLog(pool, userId, endpointId, name, payload);
    } else {
      const err = new Error(`Unsupported directive for ${endpointId}: ${name}`);
      err.status = 400;
      throw err;
    }

    const updated = await loadSmartHomeContext(pool, userId);
    return {
      context: { properties: buildStateForEndpoint(updated.profile, updated.devices, endpointId) },
    };
  }

  const err = new Error(`Unsupported endpointId: ${endpointId}`);
  err.status = 404;
  throw err;
}

module.exports = {
  ENDPOINT_IDS,
  DEFAULT_QUIET_DOWN_POLICY,
  parseQuietDownPolicy,
  serializeQuietDownPolicy,
  loadSmartHomeContext,
  buildDiscoveryEndpoints,
  buildStateForEndpoint,
  handleSmartHomeDirective,
};
