const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const dotenv = require("dotenv");
const fs = require("fs");
const path = require("path");

dotenv.config();

const { getPool, sql } = require("./db/sql");
const {
  getAlexaOauthConfig,
  createAlexaAuthorizationCode,
  exchangeAlexaAuthorizationCode,
  refreshAlexaAccessToken,
  getAlexaSkillLinkStatus,
  revokeAlexaSkillTokensForUser,
  authenticateAlexaSkillAccessToken,
  rememberAlexaSkillUser,
} = require("./services/alexaOauth");
const {
  buildRoutineTemplates,
  getSkillInvocationName,
  resolvePrayerPlaybackPlan,
  logAlexaDispatch,
} = require("./services/alexaRoutineDispatch");

const app = express();
app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use(helmet());
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: false }));
app.use("/audio", express.static(path.join(__dirname, "audio"), { maxAge: "1h" }));

// -----------------------------
// Constants
// -----------------------------
const PRAYERS = ["fajr", "dhuhr", "asr", "maghrib", "isha"];
const AMAZON_TOKEN_CACHE_TTL_MS = 5 * 60 * 1000;
const GOOGLE_PLACES_BASE = "https://places.googleapis.com/v1";
const UPSTREAM_TIMEOUT_MS = 15000;

const tokenCache = new Map(); // token -> { profile, exp }

const regionDisplay =
  typeof Intl !== "undefined" && typeof Intl.DisplayNames === "function"
    ? new Intl.DisplayNames(["en"], { type: "region" })
    : null;

// -----------------------------
// CORS
// -----------------------------
function normalizeOrigin(value) {
  const raw = String(value || "").trim().replace(/\/+$/, "");
  if (!raw) return "";

  try {
    return new URL(raw).origin;
  } catch {
    return "";
  }
}

const corsOriginsRaw = process.env.CORS_ORIGINS || "";
const allowedOrigins = corsOriginsRaw
  .split(",")
  .map(normalizeOrigin)
  .filter(Boolean);

const corsOptions = {
  origin(origin, cb) {
    if (!origin) return cb(null, true);
    if (allowedOrigins.length === 0) return cb(null, true);

    const normalizedOrigin = normalizeOrigin(origin);
    if (normalizedOrigin && allowedOrigins.includes(normalizedOrigin)) {
      return cb(null, true);
    }

    return cb(new Error("CORS blocked for origin: " + origin), false);
  },
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

// -----------------------------
// Generic helpers
// -----------------------------
function asyncHandler(fn) {
  return function wrapped(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readJsonFile(relativePath) {
  const full = path.join(__dirname, relativePath);
  const raw = fs.readFileSync(full, "utf8");
  return JSON.parse(raw);
}

function normalizeQueryText(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function getBearerToken(req) {
  const auth = req.headers.authorization || "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

function getAmazonTokenFromRequest(req) {
  return (
    getBearerToken(req) ||
    String(req.body?.accessToken || req.body?.access_token || "").trim()
  );
}

function cleanupExpiredTokenCache() {
  const now = Date.now();
  for (const [token, value] of tokenCache.entries()) {
    if (!value || value.exp <= now) tokenCache.delete(token);
  }
}

function parseOptionalNumber(value) {
  if (value === undefined || value === null || value === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function parseJsonArrayOfStrings(value) {
  if (Array.isArray(value)) {
    return value.filter((item) => typeof item === "string" && item.trim().length > 0);
  }

  if (typeof value !== "string" || !value.trim()) return [];

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item) => typeof item === "string" && item.trim().length > 0)
      : [];
  } catch {
    return [];
  }
}

function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function normalizeTimeString(value, fallback) {
  const raw = String(value || "").trim();

  if (/^\d{2}:\d{2}:\d{2}$/.test(raw)) {
    return raw;
  }

  if (/^\d{2}:\d{2}$/.test(raw)) {
    return `${raw}:00`;
  }

  const fb = String(fallback || "").trim();
  if (/^\d{2}:\d{2}:\d{2}$/.test(fb)) {
    return fb;
  }

  if (/^\d{2}:\d{2}$/.test(fb)) {
    return `${fb}:00`;
  }

  return "22:00:00";
}


function toSqlTime(value, fallback = "00:00:00") {
  const normalized = normalizeTimeString(value, fallback);
  const match = normalized.match(/^(\d{2}):(\d{2}):(\d{2})$/);

  if (!match) {
    throw new Error(`Invalid time value: ${value}`);
  }

  const hh = Number(match[1]);
  const mm = Number(match[2]);
  const ss = Number(match[3]);

  if (
    !Number.isInteger(hh) ||
    !Number.isInteger(mm) ||
    !Number.isInteger(ss) ||
    hh < 0 ||
    hh > 23 ||
    mm < 0 ||
    mm > 59 ||
    ss < 0 ||
    ss > 59
  ) {
    throw new Error(`Invalid time value: ${normalized}`);
  }

  const d = new Date(Date.UTC(1970, 0, 1, hh, mm, ss, 0));
  return d;
}


function getRegionCode(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  return /^[A-Za-z]{2}$/.test(raw) ? raw.toUpperCase() : null;
}

function normalizeStoredCountry(value, fallback = "US") {
  const raw = String(value ?? "").trim();
  if (!raw) return fallback;
  const regionCode = getRegionCode(raw);
  return regionCode || raw;
}

function countryLabel(value, fallback = "United States") {
  const raw = String(value || "").trim();
  if (!raw) return fallback;

  const regionCode = getRegionCode(raw);
  if (regionCode && regionDisplay) {
    return regionDisplay.of(regionCode) || regionCode;
  }

  return raw;
}

function buildGeocodeQuery(cityOrQuery, countryValue) {
  const q = normalizeQueryText(cityOrQuery);
  const countryText = countryLabel(countryValue, "");

  if (!q) return "";
  if (!countryText) return q;

  const lowerQ = q.toLowerCase();
  const lowerCountry = countryText.toLowerCase();

  if (lowerQ.includes(lowerCountry)) return q;
  return `${q}, ${countryText}`;
}

function normalizeMosqueSearchText(query, countryValue) {
  const q = normalizeQueryText(query);
  const countryText = countryLabel(countryValue, "");

  if (!q) {
    return countryText ? `mosques in ${countryText}` : "mosques";
  }

  if (/mosque|masjid/i.test(q)) {
    if (!countryText) return q;
    return q.toLowerCase().includes(countryText.toLowerCase())
      ? q
      : `${q}, ${countryText}`;
  }

  if (!countryText) return `mosques in ${q}`;
  return `mosques in ${q}, ${countryText}`;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = UPSTREAM_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err?.name === "AbortError") {
      const timeoutErr = new Error(`Upstream request timed out after ${timeoutMs}ms`);
      timeoutErr.status = 504;
      throw timeoutErr;
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// -----------------------------
// Auth helpers
// -----------------------------
async function fetchAmazonProfile(accessToken) {
  if (!accessToken) {
    const err = new Error("Missing Amazon access token");
    err.status = 401;
    throw err;
  }

  cleanupExpiredTokenCache();

  const now = Date.now();
  const cached = tokenCache.get(accessToken);
  if (cached && cached.exp > now) return cached.profile;

  const resp = await fetchWithTimeout("https://api.amazon.com/user/profile", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    const err = new Error(`Amazon profile failed (${resp.status}): ${text}`);
    err.status = 401;
    throw err;
  }

  const profile = await resp.json();
  if (!profile?.user_id) {
    const err = new Error("Amazon token invalid");
    err.status = 401;
    throw err;
  }

  tokenCache.set(accessToken, {
    profile,
    exp: now + AMAZON_TOKEN_CACHE_TTL_MS,
  });

  return profile;
}

async function requireAmazonAuth(req, res, next) {
  try {
    const token = getBearerToken(req);
    if (!token) {
      return res
        .status(401)
        .json({ error: "Missing Authorization: Bearer <token>" });
    }

    const profile = await fetchAmazonProfile(token);
    req.amazonProfile = profile;
    req.amazonToken = token;
    next();
  } catch (e) {
    const status = e.status || 401;
    res.status(status).json({ error: String(e.message || e) });
  }
}

async function requireAlexaSkillAuth(req, res, next) {
  try {
    const token = getBearerToken(req);
    if (!token) {
      return res.status(401).json({ error: "Missing Alexa skill bearer token." });
    }

    const pool = await getPool();
    const auth = await authenticateAlexaSkillAccessToken(pool, token);
    if (!auth) {
      return res.status(401).json({ error: "Alexa skill token is invalid or expired." });
    }

    req.skillAuth = auth;
    next();
  } catch (e) {
    const status = e.status || 401;
    res.status(status).json({ error: String(e.message || e) });
  }
}

// -----------------------------
// DB helpers
// -----------------------------
function isDuplicateSqlError(err) {
  const number = Number(err?.number);
  return number === 2601 || number === 2627;
}

async function ensureUser(pool, amazonUserId) {
  const tx = new sql.Transaction(pool);
  await tx.begin();

  try {
    let userId = null;

    const existing = await new sql.Request(tx)
      .input("amazon_user_id", sql.NVarChar(255), amazonUserId)
      .query(`
        SELECT TOP 1 id
        FROM dbo.users
        WHERE amazon_user_id = @amazon_user_id
      `);

    userId = existing.recordset[0]?.id || null;

    if (!userId) {
      try {
        const inserted = await new sql.Request(tx)
          .input("amazon_user_id", sql.NVarChar(255), amazonUserId)
          .query(`
            INSERT INTO dbo.users (amazon_user_id)
            OUTPUT inserted.id AS id
            VALUES (@amazon_user_id)
          `);

        userId = inserted.recordset[0]?.id || null;
      } catch (err) {
        if (!isDuplicateSqlError(err)) {
          throw err;
        }

        const reread = await new sql.Request(tx)
          .input("amazon_user_id", sql.NVarChar(255), amazonUserId)
          .query(`
            SELECT TOP 1 id
            FROM dbo.users
            WHERE amazon_user_id = @amazon_user_id
          `);

        userId = reread.recordset[0]?.id || null;
      }
    }

    if (!userId) {
      throw new Error("Could not resolve or create user id.");
    }

    await new sql.Request(tx)
      .input("user_id", sql.UniqueIdentifier, userId)
      .query(`
        IF NOT EXISTS (SELECT 1 FROM dbo.user_profiles WHERE user_id = @user_id)
          INSERT INTO dbo.user_profiles (user_id) VALUES (@user_id);
      `);

    for (const prayerName of PRAYERS) {
      await new sql.Request(tx)
        .input("user_id", sql.UniqueIdentifier, userId)
        .input("prayer_name", sql.NVarChar(10), prayerName)
        .query(`
          IF NOT EXISTS (
            SELECT 1
            FROM dbo.prayer_configs
            WHERE user_id = @user_id AND prayer_name = @prayer_name
          )
            INSERT INTO dbo.prayer_configs (user_id, prayer_name)
            VALUES (@user_id, @prayer_name);
        `);
    }

    await tx.commit();
    return userId;
  } catch (err) {
    await tx.rollback();
    throw err;
  }
}

async function getUserProfileAndPrayers(pool, amazonUserId) {
  const userId = await ensureUser(pool, amazonUserId);

  const profileResult = await pool
    .request()
    .input("user_id", sql.UniqueIdentifier, userId)
    .query(`SELECT * FROM dbo.user_profiles WHERE user_id = @user_id`);

  const prayerResult = await pool
    .request()
    .input("user_id", sql.UniqueIdentifier, userId)
    .query(`
      SELECT prayer_name, enabled, offset_min, quiet_enabled, quiet_from, quiet_to, adhan_reciter_id, after_type, after_payload_json
      FROM dbo.prayer_configs
      WHERE user_id = @user_id
      ORDER BY prayer_name
    `);

  return {
    userId,
    profile: profileResult.recordset[0] || {},
    prayers: prayerResult.recordset || [],
  };
}

async function getUserProfileAndPrayersByUserId(pool, userId) {
  const profileResult = await pool
    .request()
    .input("user_id", sql.UniqueIdentifier, userId)
    .query(`SELECT * FROM dbo.user_profiles WHERE user_id = @user_id`);

  const prayerResult = await pool
    .request()
    .input("user_id", sql.UniqueIdentifier, userId)
    .query(`
      SELECT prayer_name, enabled, offset_min, quiet_enabled, quiet_from, quiet_to, adhan_reciter_id, after_type, after_payload_json
      FROM dbo.prayer_configs
      WHERE user_id = @user_id
      ORDER BY prayer_name
    `);

  return {
    userId,
    profile: profileResult.recordset[0] || {},
    prayers: prayerResult.recordset || [],
  };
}

// -----------------------------
// Prayer helpers
// -----------------------------
function addMinutesHHMM(hhmm, deltaMin) {
  const [hh, mm] = String(hhmm || "").split(":").map(Number);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return hhmm;

  let total = hh * 60 + mm + Number(deltaMin || 0);
  total = ((total % 1440) + 1440) % 1440;

  const outH = Math.floor(total / 60);
  const outM = total % 60;
  return `${String(outH).padStart(2, "0")}:${String(outM).padStart(2, "0")}`;
}

function to12h(hhmm) {
  const [hh, mm] = String(hhmm || "").split(":").map(Number);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return hhmm;

  const suffix = hh >= 12 ? "PM" : "AM";
  const h12 = ((hh + 11) % 12) + 1;
  return `${h12}:${String(mm).padStart(2, "0")} ${suffix}`;
}

function parseOffsetsFromBody(body, fallback) {
  const src = body?.globalOffsets || body?.offsets || {};
  const out = {};

  for (const prayer of PRAYERS) {
    if (hasOwn(src, prayer)) {
      const n = Number(src[prayer]);
      out[prayer] = Number.isFinite(n) ? n : fallback[prayer];
    } else {
      out[prayer] = fallback[prayer];
    }
  }

  return out;
}

function mapCalcMethodToAlAdhan(method, sect) {
  const m = String(method || "").toLowerCase();

  if (String(sect || "").toUpperCase() === "SHIA") return 0; // Jafari
  if (m.includes("karachi")) return 1;
  if (m.includes("isna")) return 2;
  if (m.includes("mwl")) return 3;
  if (m.includes("umm")) return 4;
  if (m.includes("makkah")) return 4;
  if (m.includes("egypt")) return 5;
  if (m.includes("tehran")) return 7;

  return 2; // ISNA
}

function madhhabToSchool(madhhab) {
  return String(madhhab || "").toLowerCase() === "hanafi" ? 1 : 0;
}

function daysArrayToMask(days) {
  if (!Array.isArray(days) || days.length !== 7) return 127;
  let mask = 0;
  for (let i = 0; i < 7; i++) {
    if (days[i]) mask |= 1 << i;
  }
  return mask;
}

function maskToDaysArray(mask) {
  const m = Number(mask || 127);
  return Array.from({ length: 7 }, (_, i) => ((m >> i) & 1) === 1);
}

function resolveTimingSource(profile) {
  const hasUserCoords =
    typeof profile.latitude === "number" &&
    Number.isFinite(profile.latitude) &&
    typeof profile.longitude === "number" &&
    Number.isFinite(profile.longitude);

  const hasMosqueCoords =
    typeof profile.mosque_lat === "number" &&
    Number.isFinite(profile.mosque_lat) &&
    typeof profile.mosque_lng === "number" &&
    Number.isFinite(profile.mosque_lng);

  if (profile.use_mosque_location && hasMosqueCoords) {
    return {
      source: "mosque",
      latitude: profile.mosque_lat,
      longitude: profile.mosque_lng,
      fallbackReason: null,
    };
  }

  if (hasUserCoords) {
    return {
      source: "personal",
      latitude: profile.latitude,
      longitude: profile.longitude,
      fallbackReason:
        profile.use_mosque_location && !hasMosqueCoords
          ? "Saved mosque does not have usable coordinates yet."
          : null,
    };
  }

  return {
    source: "city",
    latitude: null,
    longitude: null,
    fallbackReason:
      profile.use_mosque_location && !hasMosqueCoords
        ? "Saved mosque does not have usable coordinates yet."
        : null,
  };
}

async function computePrayerTimesForProfile(profile, prayers) {
  const perPrayerOffset = {};
  const enabledMap = {};
  for (const r of prayers || []) {
    perPrayerOffset[r.prayer_name] = r.offset_min || 0;
    enabledMap[r.prayer_name] = !!r.enabled;
  }

  const method = mapCalcMethodToAlAdhan(
    profile.calculation_method || "isna",
    profile.sect || "SUNNI"
  );
  const school = madhhabToSchool(profile.madhhab || "hanafi");

  const city = normalizeQueryText(profile.city || "Chicago");
  const country = profile.country || "US";
  const countryForApi = countryLabel(country, "United States");
  const timing = resolveTimingSource(profile);

  const url =
    timing.latitude != null && timing.longitude != null
      ? `https://api.aladhan.com/v1/timings?latitude=${encodeURIComponent(
          timing.latitude
        )}&longitude=${encodeURIComponent(
          timing.longitude
        )}&method=${method}&school=${school}`
      : `https://api.aladhan.com/v1/timingsByCity?city=${encodeURIComponent(
          city
        )}&country=${encodeURIComponent(countryForApi)}&method=${method}&school=${school}`;

  const resp = await fetchWithTimeout(url);
  if (!resp.ok) {
    const err = new Error("Prayer API upstream failed");
    err.status = 502;
    throw err;
  }

  const json = await resp.json();
  const t = json?.data?.timings || {};

  const base24 = {
    fajr: String(t.Fajr || "").slice(0, 5),
    sunrise: String(t.Sunrise || "").slice(0, 5),
    dhuhr: String(t.Dhuhr || "").slice(0, 5),
    asr: String(t.Asr || "").slice(0, 5),
    maghrib: String(t.Maghrib || "").slice(0, 5),
    isha: String(t.Isha || "").slice(0, 5),
  };

  const globalOffsets = {
    fajr: profile.offset_fajr || 0,
    dhuhr: profile.offset_dhuhr || 0,
    asr: profile.offset_asr || 0,
    maghrib: profile.offset_maghrib || 0,
    isha: profile.offset_isha || 0,
  };

  const adjusted24 = {
    fajr: addMinutesHHMM(base24.fajr, globalOffsets.fajr + (perPrayerOffset.fajr || 0)),
    sunrise: base24.sunrise,
    dhuhr: addMinutesHHMM(base24.dhuhr, globalOffsets.dhuhr + (perPrayerOffset.dhuhr || 0)),
    asr: addMinutesHHMM(base24.asr, globalOffsets.asr + (perPrayerOffset.asr || 0)),
    maghrib: addMinutesHHMM(
      base24.maghrib,
      globalOffsets.maghrib + (perPrayerOffset.maghrib || 0)
    ),
    isha: addMinutesHHMM(base24.isha, globalOffsets.isha + (perPrayerOffset.isha || 0)),
  };

  const adjusted12 = {
    fajr: to12h(adjusted24.fajr),
    sunrise: to12h(adjusted24.sunrise),
    dhuhr: to12h(adjusted24.dhuhr),
    asr: to12h(adjusted24.asr),
    maghrib: to12h(adjusted24.maghrib),
    isha: to12h(adjusted24.isha),
  };

  return {
    location: {
      city,
      country,
      timezone: profile.timezone || "Etc/UTC",
      latitude: timing.source === "city" ? null : timing.latitude,
      longitude: timing.source === "city" ? null : timing.longitude,
    },
    mosque: {
      id: profile.mosque_id || null,
      name: profile.mosque_name || null,
      address: profile.mosque_address || null,
      latitude:
        typeof profile.mosque_lat === "number" && Number.isFinite(profile.mosque_lat)
          ? profile.mosque_lat
          : null,
      longitude:
        typeof profile.mosque_lng === "number" && Number.isFinite(profile.mosque_lng)
          ? profile.mosque_lng
          : null,
    },
    method: {
      sect: profile.sect || "SUNNI",
      calculationMethod: profile.calculation_method || "isna",
      madhhab: profile.madhhab || "hanafi",
    },
    source: timing.source,
    sourceDetail: {
      useMosqueLocation: !!profile.use_mosque_location,
      fallbackReason: timing.fallbackReason,
    },
    enabled: enabledMap,
    prayers24: adjusted24,
    prayers12: adjusted12,
    date: json?.data?.date || null,
    meta: json?.data?.meta || null,
  };
}

// -----------------------------
// Qiblah helpers
// -----------------------------
function degToRad(deg) {
  return (deg * Math.PI) / 180;
}

function radToDeg(rad) {
  return (rad * 180) / Math.PI;
}

function bearingToCompass(bearing) {
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const idx = Math.round((((bearing % 360) + 360) % 360) / 45) % 8;
  return dirs[idx];
}

function computeQiblahBearing(lat, lon) {
  const kaabaLat = degToRad(21.4225);
  const kaabaLon = degToRad(39.8262);

  const phi1 = degToRad(lat);
  const lambda1 = degToRad(lon);

  const y = Math.sin(kaabaLon - lambda1);
  const x =
    Math.cos(phi1) * Math.tan(kaabaLat) -
    Math.sin(phi1) * Math.cos(kaabaLon - lambda1);

  const theta = Math.atan2(y, x);
  return ((radToDeg(theta) % 360) + 360) % 360;
}

// -----------------------------
// User settings shape
// -----------------------------
function buildUserSettingsPayload(amazonUserId, profile, prayerRows) {
  const rows = Array.isArray(prayerRows) ? prayerRows : [];
  const selectedAlexaDeviceIds = parseJsonArrayOfStrings(
    profile.selected_alexa_device_ids_json
  );

  const firstQuietRow =
    rows.find((r) => r.quiet_enabled || r.quiet_from || r.quiet_to) || rows[0] || {};

  const quietHours = {
    enabled: !!firstQuietRow.quiet_enabled,
    from: firstQuietRow.quiet_from
      ? String(firstQuietRow.quiet_from).slice(0, 5)
      : "22:00",
    to: firstQuietRow.quiet_to
      ? String(firstQuietRow.quiet_to).slice(0, 5)
      : "07:00",
    muteFajr: true,
  };

  const prayerConfigs = rows.map((r) => {
    let afterPayload = null;
    try {
      afterPayload = r.after_payload_json ? JSON.parse(r.after_payload_json) : null;
    } catch {
      afterPayload = null;
    }

    return {
      prayerName: r.prayer_name,
      enabled: !!r.enabled,
      offsetMin: r.offset_min || 0,
      quietEnabled: !!r.quiet_enabled,
      quietFrom: r.quiet_from ? String(r.quiet_from).slice(0, 5) : "22:00",
      quietTo: r.quiet_to ? String(r.quiet_to).slice(0, 5) : "07:00",
      adhanReciterId: r.adhan_reciter_id || null,
      afterAdhan: {
        type: r.after_type || "none",
        payload: afterPayload,
      },
    };
  });

  return {
    userId: amazonUserId,
    userKey: amazonUserId,
    sect: profile.sect || "SUNNI",
    shia: profile.sect === "SHIA",
    language: profile.language || "en",
    madhhab: profile.madhhab || "hanafi",
    madhab: profile.sect === "SHIA" ? "shia" : "sunni",
    calculationMethod: profile.calculation_method || "isna",
    method: profile.calculation_method || "isna",
    highLatitudeMethod: profile.high_latitude_method || "automatic",
    country: profile.country || "US",
    city: profile.city || "Chicago",
    timezone: profile.timezone || "Etc/UTC",
    latitude:
      typeof profile.latitude === "number" && Number.isFinite(profile.latitude)
        ? profile.latitude
        : null,
    longitude:
      typeof profile.longitude === "number" && Number.isFinite(profile.longitude)
        ? profile.longitude
        : null,
    useMosqueLocation: !!profile.use_mosque_location,
    mosqueId: profile.mosque_id || null,
    mosqueName: profile.mosque_name || null,
    mosqueAddress: profile.mosque_address || null,
    mosqueLat:
      typeof profile.mosque_lat === "number" && Number.isFinite(profile.mosque_lat)
        ? profile.mosque_lat
        : null,
    mosqueLng:
      typeof profile.mosque_lng === "number" && Number.isFinite(profile.mosque_lng)
        ? profile.mosque_lng
        : null,
    selectedAlexaDeviceIds,
    accountEnabled: !!profile.account_enabled,
    quietHours,
    globalOffsets: {
      fajr: profile.offset_fajr || 0,
      dhuhr: profile.offset_dhuhr || 0,
      asr: profile.offset_asr || 0,
      maghrib: profile.offset_maghrib || 0,
      isha: profile.offset_isha || 0,
    },
    offsets: {
      fajr: profile.offset_fajr || 0,
      dhuhr: profile.offset_dhuhr || 0,
      asr: profile.offset_asr || 0,
      maghrib: profile.offset_maghrib || 0,
      isha: profile.offset_isha || 0,
    },
    prayerConfigs,
  };
}

// -----------------------------
// Google Places helpers
// -----------------------------
async function googlePlacesPost(endpoint, body, fieldMask) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    const err = new Error("GOOGLE_PLACES_API_KEY is not configured");
    err.status = 500;
    throw err;
  }

  const resp = await fetchWithTimeout(`${GOOGLE_PLACES_BASE}${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": fieldMask,
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    const err = new Error(`Google Places request failed (${resp.status}): ${text}`);
    err.status = 502;
    throw err;
  }

  return resp.json();
}

function normalizePlace(place) {
  const displayName =
    place?.displayName?.text ||
    place?.displayName ||
    place?.name ||
    "Unknown mosque";

  const placeId =
    place?.id ||
    (typeof place?.name === "string" && place.name.startsWith("places/")
      ? place.name.replace(/^places\//, "")
      : null);

  return {
    placeId: placeId || null,
    name: displayName,
    address: place?.formattedAddress || null,
    location:
      typeof place?.location?.latitude === "number" &&
        typeof place?.location?.longitude === "number"
        ? {
          lat: place.location.latitude,
          lng: place.location.longitude,
        }
        : null,
  };
}

function dedupeMosques(list) {
  const seen = new Set();
  const out = [];

  for (const item of list) {
    const key =
      item.placeId ||
      `${String(item.name || "").toLowerCase()}|${String(item.address || "").toLowerCase()}`;

    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }

  return out;
}

// -----------------------------
// Routes
// -----------------------------
app.get("/", (req, res) => {
  res.json({ ok: true, service: "adhanhome-api" });
});

app.get("/health", (req, res) => res.json({ ok: true }));
app.get("/api/health", (req, res) => res.json({ ok: true }));

app.get(
  "/api/health/db",
  asyncHandler(async (req, res) => {
    const pool = await getPool();
    await pool.request().query("SELECT 1 AS ok");
    res.json({ ok: true, db: true });
  })
);

app.get(
  "/api/geocode",
  asyncHandler(async (req, res) => {
    const query = normalizeQueryText(req.query.query || req.query.city || "");
    const country = normalizeStoredCountry(
      req.query.country || req.query.countryCode || "US",
      "US"
    );

    if (!query) {
      return res.status(400).json({ error: "city or query is required" });
    }

    const apiKey = process.env.OPENCAGE_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "OPENCAGE_API_KEY is not configured" });
    }

    const geocodeText = buildGeocodeQuery(query, country);
    const url =
      `https://api.opencagedata.com/geocode/v1/json` +
      `?q=${encodeURIComponent(geocodeText)}` +
      `&key=${encodeURIComponent(apiKey)}` +
      `&limit=1&no_annotations=0`;

    const upstream = await fetchWithTimeout(url);
    if (!upstream.ok) {
      const text = await upstream.text().catch(() => "");
      return res.status(502).json({
        error: `Geocoding upstream failed (${upstream.status}) ${text}`.trim(),
      });
    }

    const data = await upstream.json();
    const first = data?.results?.[0];

    if (!first?.geometry) {
      return res.status(404).json({
        error: "Could not look up coordinates for this location. Please try again.",
      });
    }

    const lat = first.geometry.lat;
    const lng = first.geometry.lng;
    const timezone = first?.annotations?.timezone?.name || "Etc/UTC";

    res.json({
      lat,
      lng,
      timezone,
      formatted: first.formatted || null,
      country,
      query,
    });
  })
);

app.get(
  "/api/integrations",
  requireAmazonAuth,
  asyncHandler(async (req, res) => {
    const p = req.amazonProfile;
    const pool = await getPool();
    const userId = await ensureUser(pool, p.user_id);
    const skillLink = await getAlexaSkillLinkStatus(pool, userId);

    res.json({
      userKey: p.user_id,
      amazon: {
        connected: true,
        email: p.email || null,
      },
      alexa: {
        connected: true,
        linkedAt: null,
        displayName: p.name || null,
        accountId: p.user_id || null,
        skillLinked: !!skillLink.linked,
        skillLinkExpiresAt: skillLink.expiresAt,
      },
      google: {
        connected: false,
        linkedAt: null,
      },
      apple: {
        connected: false,
        linkedAt: null,
      },
    });
  })
);

app.post(
  "/api/integrations/alexa/login",
  asyncHandler(async (req, res) => {
    const accessToken = getAmazonTokenFromRequest(req);
    if (!accessToken) {
      return res.status(400).json({ error: "Missing accessToken" });
    }

    const profile = await fetchAmazonProfile(accessToken);
    const pool = await getPool();
    const userId = await ensureUser(pool, profile.user_id);

    await pool
      .request()
      .input("user_id", sql.UniqueIdentifier, userId)
      .query(`
        UPDATE dbo.user_profiles
        SET
          account_enabled = 1,
          updated_at = SYSUTCDATETIME()
        WHERE user_id = @user_id
      `);

    res.json({
      ok: true,
      userKey: profile.user_id,
      alexa: {
        connected: true,
        linkedAt: new Date().toISOString(),
        displayName: profile.name || null,
        accountId: profile.user_id || null,
      },
      amazon: {
        connected: true,
        email: profile.email || null,
      },
    });
  })
);

app.post(
  "/api/integrations/alexa/disconnect",
  requireAmazonAuth,
  asyncHandler(async (req, res) => {
    const pool = await getPool();
    const userId = await ensureUser(pool, req.amazonProfile.user_id);
    await revokeAlexaSkillTokensForUser(pool, userId);

    res.json({ ok: true });
  })
);

app.get(
  "/api/alexa/account-linking/status",
  requireAmazonAuth,
  asyncHandler(async (req, res) => {
    const pool = await getPool();
    const userId = await ensureUser(pool, req.amazonProfile.user_id);
    const status = await getAlexaSkillLinkStatus(pool, userId);
    const oauth = getAlexaOauthConfig();

    res.json({
      configured: oauth.configured,
      clientId: oauth.clientId || null,
      redirectUris: oauth.redirectUris,
      invocationName: getSkillInvocationName(),
      ...status,
    });
  })
);

app.post(
  "/api/alexa/account-linking/authorize",
  requireAmazonAuth,
  asyncHandler(async (req, res) => {
    const body = req.body || {};
    const responseType = String(body.responseType || body.response_type || "code").toLowerCase();
    if (responseType !== "code") {
      return res.status(400).json({ error: "Only OAuth authorization-code linking is supported." });
    }

    const pool = await getPool();
    const userId = await ensureUser(pool, req.amazonProfile.user_id);
    const created = await createAlexaAuthorizationCode(pool, {
      userId,
      clientId: body.clientId || body.client_id,
      redirectUri: body.redirectUri || body.redirect_uri,
      scope: body.scope || "alexa",
    });

    const redirectUrl = new URL(String(body.redirectUri || body.redirect_uri));
    redirectUrl.searchParams.set("code", created.code);
    if (body.state) {
      redirectUrl.searchParams.set("state", String(body.state));
    }

    res.json({
      ok: true,
      redirectUrl: redirectUrl.toString(),
      expiresAt: created.expiresAt,
      scope: created.scope,
    });
  })
);

app.post(
  "/oauth/token",
  asyncHandler(async (req, res) => {
    const auth = String(req.headers.authorization || "");
    let clientId = String(req.body?.client_id || "").trim();
    let clientSecret = String(req.body?.client_secret || "").trim();

    const basic = auth.match(/^Basic\s+(.+)$/i);
    if (basic) {
      try {
        const decoded = Buffer.from(basic[1], "base64").toString("utf8");
        const splitAt = decoded.indexOf(":");
        if (splitAt >= 0) {
          clientId = decoded.slice(0, splitAt);
          clientSecret = decoded.slice(splitAt + 1);
        }
      } catch (err) {
        return res.status(401).json({ error: "Invalid Basic authorization header." });
      }
    }

    const grantType = String(req.body?.grant_type || "").trim().toLowerCase();
    const pool = await getPool();

    let tokenSet;
    if (grantType === "authorization_code") {
      tokenSet = await exchangeAlexaAuthorizationCode(pool, {
        clientId,
        clientSecret,
        code: req.body?.code,
        redirectUri: req.body?.redirect_uri,
      });
    } else if (grantType === "refresh_token") {
      tokenSet = await refreshAlexaAccessToken(pool, {
        clientId,
        clientSecret,
        refreshToken: req.body?.refresh_token,
      });
    } else {
      return res.status(400).json({ error: "Unsupported grant_type." });
    }

    res.json({
      access_token: tokenSet.accessToken,
      token_type: tokenSet.tokenType,
      expires_in: tokenSet.expiresIn,
      refresh_token: tokenSet.refreshToken,
      scope: tokenSet.scope,
    });
  })
);

app.get(
  "/api/alexa/routines/templates",
  requireAmazonAuth,
  asyncHandler(async (req, res) => {
    res.json({
      invocationName: getSkillInvocationName(),
      templates: buildRoutineTemplates(),
    });
  })
);

app.get(
  "/api/alexa/skill/prayer-times",
  requireAlexaSkillAuth,
  asyncHandler(async (req, res) => {
    const pool = await getPool();
    const { profile, prayers } = await getUserProfileAndPrayersByUserId(
      pool,
      req.skillAuth.userId
    );

    const result = await computePrayerTimesForProfile(profile, prayers);
    res.json(result);
  })
);

app.post(
  "/api/alexa/skill/playback",
  requireAlexaSkillAuth,
  asyncHandler(async (req, res) => {
    const pool = await getPool();
    const prayerName = String(req.body?.prayerName || req.body?.prayer || "").trim().toLowerCase();
    const requestId = req.body?.requestId ? String(req.body.requestId) : null;
    const deviceId = req.body?.deviceId ? String(req.body.deviceId) : null;
    const alexaUserId = req.body?.alexaUserId ? String(req.body.alexaUserId) : null;

    if (alexaUserId) {
      await rememberAlexaSkillUser(pool, req.skillAuth.tokenId, alexaUserId);
    }

    try {
      const plan = await resolvePrayerPlaybackPlan(pool, {
        userId: req.skillAuth.userId,
        prayerName,
        req,
        deviceId,
      });

      await logAlexaDispatch(pool, {
        userId: req.skillAuth.userId,
        requestId,
        prayerName,
        deviceId,
        triggerSource: "skill",
        status: "resolved",
        message: `Resolved ${prayerName} playback`,
        payload: {
          reciterId: plan.reciterId,
          afterAdhan: plan.afterAdhan,
          userContext: plan.userContext,
        },
      });

      res.json(plan);
    } catch (err) {
      await logAlexaDispatch(pool, {
        userId: req.skillAuth.userId,
        requestId,
        prayerName,
        deviceId,
        triggerSource: "skill",
        status: "failed",
        message: String(err?.message || err),
        payload: {
          alexaUserId,
        },
      });

      throw err;
    }
  })
);

// Library
app.get(
  "/api/library/reciters",
  asyncHandler(async (req, res) => {
    const type = String(req.query.type || "").toLowerCase();
    const data = readJsonFile(path.join("library", "reciters.json"));
    const out = type
      ? data.filter((r) => String(r.type || "").toLowerCase() === type)
      : data;
    res.json(out);
  })
);

// Duas
app.get(
  "/api/duas",
  asyncHandler(async (req, res) => {
    const data = readJsonFile(path.join("data", "duas.json"));
    res.json(data);
  })
);

// Mosque search
app.get(
  "/api/mosques",
  requireAmazonAuth,
  asyncHandler(async (req, res) => {
    const pool = await getPool();
    const { profile } = await getUserProfileAndPrayers(pool, req.amazonProfile.user_id);

    const country = normalizeStoredCountry(
      req.query.country || profile.country || "US",
      "US"
    );
    const regionCode = getRegionCode(country);
    const rawQuery = normalizeQueryText(req.query.query || profile.city || "");
    const bias = String(req.query.bias || "user").trim().toLowerCase();
    const radiusKm = clampNumber(req.query.radiusKm, 1, 50, 25);
    const radiusMeters = radiusKm * 1000;

    const hasUserCoords =
      typeof profile.latitude === "number" &&
      Number.isFinite(profile.latitude) &&
      typeof profile.longitude === "number" &&
      Number.isFinite(profile.longitude);

    let source = "text";
    let placesJson = null;

    if (bias === "user" && hasUserCoords) {
      source = "nearby";
      placesJson = await googlePlacesPost(
        "/places:searchNearby",
        {
          includedTypes: ["mosque"],
          maxResultCount: 20,
          rankPreference: "DISTANCE",
          locationRestriction: {
            circle: {
              center: {
                latitude: profile.latitude,
                longitude: profile.longitude,
              },
              radius: radiusMeters,
            },
          },
        },
        "places.id,places.name,places.displayName,places.formattedAddress,places.location"
      );
    }

    if (
      !placesJson ||
      !Array.isArray(placesJson.places) ||
      placesJson.places.length === 0
    ) {
      source = source === "nearby" ? "text-fallback" : "text";

      const textBody = {
        textQuery: normalizeMosqueSearchText(rawQuery, country),
        includedType: "mosque",
        strictTypeFiltering: true,
        maxResultCount: 20,
      };

      if (regionCode) {
        textBody.regionCode = regionCode;
      }

      placesJson = await googlePlacesPost(
        "/places:searchText",
        textBody,
        "places.id,places.name,places.displayName,places.formattedAddress,places.location"
      );
    }

    const mosques = dedupeMosques(
      Array.isArray(placesJson?.places)
        ? placesJson.places
          .map(normalizePlace)
          .filter((m) => m.placeId && m.name)
        : []
    );

    res.json({
      query: rawQuery,
      country,
      source,
      mosques,
    });
  })
);

// Qiblah
app.get(
  "/api/qiblah",
  asyncHandler(async (req, res) => {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res
        .status(400)
        .json({ error: "lat and lng query params are required numbers" });
    }

    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return res
        .status(400)
        .json({ error: "lat/lng out of valid range" });
    }

    const bearing = computeQiblahBearing(lat, lng);

    res.json({
      location: { lat, lon: lng },
      kaaba: { lat: 21.4225, lon: 39.8262 },
      bearing,
      direction: bearingToCompass(bearing),
      source: "backend-great-circle",
      message: "Qiblah direction calculated successfully.",
    });
  })
);

// Quran
app.get(
  "/api/quran/surahs",
  asyncHandler(async (req, res) => {
    const resp = await fetchWithTimeout("https://api.alquran.cloud/v1/surah");
    if (!resp.ok) {
      return res.status(502).json({ error: "Quran upstream failed" });
    }

    const json = await resp.json();
    const list = (json?.data || []).map((s) => ({
      number: s.number,
      nameArabic: s.name,
      nameEnglish: s.englishName,
      translationEnglish: s.englishNameTranslation,
      ayahs: s.numberOfAyahs,
      revelationType: s.revelationType,
    }));

    res.json({ surahs: list });
  })
);

app.get(
  "/api/quran/surahs/:id",
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id < 1 || id > 114) {
      return res.status(400).json({ error: "Invalid surah id" });
    }

    const arabicEdition = "quran-uthmani";
    const transEdition = "en.asad";
    const audioEdition = "ar.alafasy";

    const [a, t, au] = await Promise.all([
      fetchWithTimeout(`https://api.alquran.cloud/v1/surah/${id}/${arabicEdition}`),
      fetchWithTimeout(`https://api.alquran.cloud/v1/surah/${id}/${transEdition}`),
      fetchWithTimeout(`https://api.alquran.cloud/v1/surah/${id}/${audioEdition}`),
    ]);

    if (!a.ok || !t.ok || !au.ok) {
      return res.status(502).json({ error: "Quran upstream failed" });
    }

    const aj = await a.json();
    const tj = await t.json();
    const auj = await au.json();

    const arabicAyahs = aj?.data?.ayahs || [];
    const transAyahs = tj?.data?.ayahs || [];
    const audioAyahs = auj?.data?.ayahs || [];

    const ayahs = arabicAyahs.map((x, idx) => ({
      numberInSurah: x.numberInSurah,
      arabic: x.text,
      translation: transAyahs[idx]?.text || "",
      audio: audioAyahs[idx]?.audio || null,
    }));

    res.json({
      surah: {
        number: aj?.data?.number,
        nameArabic: aj?.data?.name,
        nameEnglish: aj?.data?.englishName,
        ayahs,
      },
    });
  })
);

// User settings
app.get(
  "/api/user/settings",
  requireAmazonAuth,
  asyncHandler(async (req, res) => {
    const pool = await getPool();
    const amazonUserId = req.amazonProfile.user_id;

    const { profile, prayers } = await getUserProfileAndPrayers(pool, amazonUserId);
    const settings = buildUserSettingsPayload(amazonUserId, profile, prayers);

    res.json({
      userKey: amazonUserId,
      ...settings,
      settings,
    });
  })
);

async function handleSaveUserSettings(req, res) {
  const pool = await getPool();
  const amazonUserId = req.amazonProfile.user_id;
  const { userId, profile: currentProfile } = await getUserProfileAndPrayers(
    pool,
    amazonUserId
  );
  const body = req.body || {};

  const sect = body.sect || (body.shia === true ? "SHIA" : undefined);
  const calc = body.calculationMethod || body.calculation_method;
  const madhhab = body.madhhab;
  const high = body.highLatitudeMethod || body.high_latitude_method;
  const language = body.language;

  const country = hasOwn(body, "country")
    ? normalizeStoredCountry(body.country, currentProfile.country || "US")
    : undefined;

  const city = hasOwn(body, "city")
    ? normalizeQueryText(body.city)
    : undefined;

  const timezone = hasOwn(body, "timezone")
    ? String(body.timezone || "").trim()
    : undefined;

  const latitude = parseOptionalNumber(body.latitude);
  const longitude = parseOptionalNumber(body.longitude);
  const accountEnabled = body.accountEnabled ?? body.account_enabled;
  const useMosqueLocation = hasOwn(body, "useMosqueLocation")
    ? body.useMosqueLocation === true
    : undefined;
  const hasSelectedAlexaDeviceIds =
    hasOwn(body, "selectedAlexaDeviceIds") || hasOwn(body, "selectedDeviceIds");
  const selectedAlexaDeviceIds = parseJsonArrayOfStrings(
    body.selectedAlexaDeviceIds ?? body.selectedDeviceIds
  );

  const hasMosqueId = hasOwn(body, "mosqueId");
  const hasMosqueName = hasOwn(body, "mosqueName");
  const hasMosqueAddress = hasOwn(body, "mosqueAddress");
  const hasMosqueLat = hasOwn(body, "mosqueLat");
  const hasMosqueLng = hasOwn(body, "mosqueLng");

  const offsets = parseOffsetsFromBody(body, {
    fajr: currentProfile.offset_fajr || 0,
    dhuhr: currentProfile.offset_dhuhr || 0,
    asr: currentProfile.offset_asr || 0,
    maghrib: currentProfile.offset_maghrib || 0,
    isha: currentProfile.offset_isha || 0,
  });

  const profileReq = pool.request();

  profileReq.input("user_id", sql.UniqueIdentifier, userId);
  profileReq.input(
    "sect",
    sql.NVarChar(10),
    sect !== undefined ? String(sect).toUpperCase() : null
  );
  profileReq.input(
    "calc",
    sql.NVarChar(50),
    calc !== undefined ? String(calc) : null
  );
  profileReq.input(
    "madhhab",
    sql.NVarChar(20),
    madhhab !== undefined ? String(madhhab) : null
  );
  profileReq.input(
    "high",
    sql.NVarChar(30),
    high !== undefined ? String(high) : null
  );
  profileReq.input(
    "language",
    sql.NVarChar(10),
    language !== undefined ? String(language) : null
  );
  profileReq.input("country", sql.NVarChar(64), country ?? null);
  profileReq.input("city", sql.NVarChar(128), city ?? null);
  profileReq.input("timezone", sql.NVarChar(64), timezone ?? null);
  profileReq.input("latitude", sql.Float, latitude ?? null);
  profileReq.input("longitude", sql.Float, longitude ?? null);
  profileReq.input(
    "account_enabled",
    sql.Bit,
    accountEnabled !== undefined ? (accountEnabled ? 1 : 0) : null
  );
  profileReq.input(
    "use_mosque_location",
    sql.Bit,
    useMosqueLocation !== undefined ? (useMosqueLocation ? 1 : 0) : null
  );
  profileReq.input(
    "set_selected_alexa_device_ids_json",
    sql.Bit,
    hasSelectedAlexaDeviceIds ? 1 : 0
  );
  profileReq.input(
    "selected_alexa_device_ids_json",
    sql.NVarChar(sql.MAX),
    hasSelectedAlexaDeviceIds ? JSON.stringify(selectedAlexaDeviceIds) : null
  );

  profileReq.input("off_fajr", sql.Int, offsets.fajr);
  profileReq.input("off_dhuhr", sql.Int, offsets.dhuhr);
  profileReq.input("off_asr", sql.Int, offsets.asr);
  profileReq.input("off_maghrib", sql.Int, offsets.maghrib);
  profileReq.input("off_isha", sql.Int, offsets.isha);

  profileReq.input("set_mosque_id", sql.Bit, hasMosqueId ? 1 : 0);
  profileReq.input(
    "mosque_id",
    sql.NVarChar(255),
    hasMosqueId ? (body.mosqueId ? String(body.mosqueId) : null) : null
  );

  profileReq.input("set_mosque_name", sql.Bit, hasMosqueName ? 1 : 0);
  profileReq.input(
    "mosque_name",
    sql.NVarChar(255),
    hasMosqueName ? (body.mosqueName ? String(body.mosqueName) : null) : null
  );

  profileReq.input("set_mosque_address", sql.Bit, hasMosqueAddress ? 1 : 0);
  profileReq.input(
    "mosque_address",
    sql.NVarChar(500),
    hasMosqueAddress
      ? (body.mosqueAddress ? String(body.mosqueAddress) : null)
      : null
  );

  profileReq.input("set_mosque_lat", sql.Bit, hasMosqueLat ? 1 : 0);
  profileReq.input(
    "mosque_lat",
    sql.Float,
    hasMosqueLat ? parseOptionalNumber(body.mosqueLat) ?? null : null
  );

  profileReq.input("set_mosque_lng", sql.Bit, hasMosqueLng ? 1 : 0);
  profileReq.input(
    "mosque_lng",
    sql.Float,
    hasMosqueLng ? parseOptionalNumber(body.mosqueLng) ?? null : null
  );

  await profileReq.query(`
    UPDATE dbo.user_profiles
    SET
      sect = COALESCE(@sect, sect),
      calculation_method = COALESCE(@calc, calculation_method),
      madhhab = COALESCE(@madhhab, madhhab),
      high_latitude_method = COALESCE(@high, high_latitude_method),
      language = COALESCE(@language, language),
      country = COALESCE(@country, country),
      city = COALESCE(@city, city),
      timezone = COALESCE(@timezone, timezone),
      latitude = COALESCE(@latitude, latitude),
      longitude = COALESCE(@longitude, longitude),
      use_mosque_location = COALESCE(@use_mosque_location, use_mosque_location),
      selected_alexa_device_ids_json = CASE
        WHEN @set_selected_alexa_device_ids_json = 1 THEN @selected_alexa_device_ids_json
        ELSE selected_alexa_device_ids_json
      END,
      mosque_id = CASE WHEN @set_mosque_id = 1 THEN @mosque_id ELSE mosque_id END,
      mosque_name = CASE WHEN @set_mosque_name = 1 THEN @mosque_name ELSE mosque_name END,
      mosque_address = CASE WHEN @set_mosque_address = 1 THEN @mosque_address ELSE mosque_address END,
      mosque_lat = CASE WHEN @set_mosque_lat = 1 THEN @mosque_lat ELSE mosque_lat END,
      mosque_lng = CASE WHEN @set_mosque_lng = 1 THEN @mosque_lng ELSE mosque_lng END,
      account_enabled = COALESCE(@account_enabled, account_enabled),
      offset_fajr = @off_fajr,
      offset_dhuhr = @off_dhuhr,
      offset_asr = @off_asr,
      offset_maghrib = @off_maghrib,
      offset_isha = @off_isha,
      updated_at = SYSUTCDATETIME()
    WHERE user_id = @user_id
  `);

  const quietHours = body.quietHours;
  if (isObject(quietHours)) {
    const quietEnabled = quietHours.enabled ? 1 : 0;
    const quietFrom = toSqlTime(quietHours.from, "22:00:00");
    const quietTo = toSqlTime(quietHours.to, "07:00:00");

    await pool
      .request()
      .input("user_id", sql.UniqueIdentifier, userId)
      .input("quiet_enabled", sql.Bit, quietEnabled)
      .input("quiet_from", sql.Time, quietFrom)
      .input("quiet_to", sql.Time, quietTo)
      .query(`
      UPDATE dbo.prayer_configs
      SET
        quiet_enabled = @quiet_enabled,
        quiet_from = @quiet_from,
        quiet_to = @quiet_to,
        updated_at = SYSUTCDATETIME()
      WHERE user_id = @user_id
    `);
  }

  const pcs = Array.isArray(body.prayerConfigs) ? body.prayerConfigs : null;
  if (pcs) {
    for (const pc of pcs) {
      const prayerName = String(pc.prayerName || pc.prayer_name || "").toLowerCase();
      if (!PRAYERS.includes(prayerName)) continue;

      const setEnabled = hasOwn(pc, "enabled");
      const setOffsetMin =
        hasOwn(pc, "offsetMin") || hasOwn(pc, "offset_min");
      const setQuietEnabled =
        hasOwn(pc, "quietEnabled") || hasOwn(pc, "quiet_enabled");
      const setQuietFrom =
        hasOwn(pc, "quietFrom") || hasOwn(pc, "quiet_from");
      const setQuietTo =
        hasOwn(pc, "quietTo") || hasOwn(pc, "quiet_to");
      const setAdhanReciterId =
        hasOwn(pc, "adhanReciterId") || hasOwn(pc, "adhan_reciter_id");
      const setAfterAdhan =
        hasOwn(pc, "afterAdhan") ||
        hasOwn(pc, "after_type") ||
        hasOwn(pc, "after_payload") ||
        hasOwn(pc, "after_payload_json");

      const rawAfterType = String(
        pc.afterAdhan?.type || pc.after_type || "none"
      ).toLowerCase();

      const afterType = ["none", "dua", "surah"].includes(rawAfterType)
        ? rawAfterType
        : "none";

      const afterPayload = pc.afterAdhan?.payload ?? pc.after_payload ?? null;
      const afterPayloadJson = afterPayload ? JSON.stringify(afterPayload) : null;

      await pool
        .request()
        .input("user_id", sql.UniqueIdentifier, userId)
        .input("prayer_name", sql.NVarChar(10), prayerName)

        .input("set_enabled", sql.Bit, setEnabled ? 1 : 0)
        .input(
          "enabled",
          sql.Bit,
          setEnabled ? (pc.enabled === false ? 0 : 1) : null
        )

        .input("set_offset_min", sql.Bit, setOffsetMin ? 1 : 0)
        .input(
          "offset_min",
          sql.Int,
          setOffsetMin ? Number(pc.offsetMin ?? pc.offset_min ?? 0) : null
        )

        .input("set_quiet_enabled", sql.Bit, setQuietEnabled ? 1 : 0)
        .input(
          "quiet_enabled",
          sql.Bit,
          setQuietEnabled ? (pc.quietEnabled ? 1 : 0) : null
        )

        .input("set_quiet_from", sql.Bit, setQuietFrom ? 1 : 0)
        .input(
          "quiet_from",
          sql.Time,
          setQuietFrom
            ? toSqlTime(pc.quietFrom ?? pc.quiet_from, "22:00:00")
            : null
        )

        .input("set_quiet_to", sql.Bit, setQuietTo ? 1 : 0)
        .input(
          "quiet_to",
          sql.Time,
          setQuietTo
            ? toSqlTime(pc.quietTo ?? pc.quiet_to, "07:00:00")
            : null
        )

        .input("set_adhan_reciter_id", sql.Bit, setAdhanReciterId ? 1 : 0)
        .input(
          "adhan_reciter_id",
          sql.NVarChar(64),
          setAdhanReciterId
            ? (pc.adhanReciterId ? String(pc.adhanReciterId) : null)
            : null
        )

        .input("set_after_type", sql.Bit, setAfterAdhan ? 1 : 0)
        .input(
          "after_type",
          sql.NVarChar(16),
          setAfterAdhan ? afterType : null
        )

        .input("set_after_payload_json", sql.Bit, setAfterAdhan ? 1 : 0)
        .input(
          "after_payload_json",
          sql.NVarChar(sql.MAX),
          setAfterAdhan ? afterPayloadJson : null
        )
        .query(`
          UPDATE dbo.prayer_configs
          SET
            enabled = CASE WHEN @set_enabled = 1 THEN @enabled ELSE enabled END,
            offset_min = CASE WHEN @set_offset_min = 1 THEN @offset_min ELSE offset_min END,
            quiet_enabled = CASE WHEN @set_quiet_enabled = 1 THEN @quiet_enabled ELSE quiet_enabled END,
            quiet_from = CASE WHEN @set_quiet_from = 1 THEN @quiet_from ELSE quiet_from END,
            quiet_to = CASE WHEN @set_quiet_to = 1 THEN @quiet_to ELSE quiet_to END,
            adhan_reciter_id = CASE WHEN @set_adhan_reciter_id = 1 THEN @adhan_reciter_id ELSE adhan_reciter_id END,
            after_type = CASE WHEN @set_after_type = 1 THEN @after_type ELSE after_type END,
            after_payload_json = CASE WHEN @set_after_payload_json = 1 THEN @after_payload_json ELSE after_payload_json END,
            updated_at = SYSUTCDATETIME()
          WHERE user_id = @user_id AND prayer_name = @prayer_name
        `);
    }
  }

  const refreshed = await getUserProfileAndPrayers(pool, amazonUserId);
  const settings = buildUserSettingsPayload(
    amazonUserId,
    refreshed.profile,
    refreshed.prayers
  );

  res.json({
    ok: true,
    userKey: amazonUserId,
    ...settings,
    settings,
  });
}

app.put("/api/user/settings", requireAmazonAuth, asyncHandler(handleSaveUserSettings));
app.post("/api/user/settings", requireAmazonAuth, asyncHandler(handleSaveUserSettings));

// Prayer times
app.get(
  "/api/prayer-times/today",
  requireAmazonAuth,
  asyncHandler(async (req, res) => {
    const pool = await getPool();
    const amazonUserId = req.amazonProfile.user_id;
    const { profile, prayers } = await getUserProfileAndPrayers(pool, amazonUserId);

    const result = await computePrayerTimesForProfile(profile, prayers);
    res.json(result);
  })
);

// Alexa devices
app.get(
  "/api/alexa/devices",
  requireAmazonAuth,
  asyncHandler(async (req, res) => {
    const pool = await getPool();
    const amazonUserId = req.amazonProfile.user_id;
    const userId = await ensureUser(pool, amazonUserId);

    const result = await pool
      .request()
      .input("user_id", sql.UniqueIdentifier, userId)
      .query(`
        SELECT device_id AS id, device_name AS name, platform
        FROM dbo.devices
        WHERE user_id = @user_id AND platform = 'alexa'
        ORDER BY device_name
      `);

    res.json({ devices: result.recordset });
  })
);

app.post(
  "/api/alexa/devices",
  requireAmazonAuth,
  asyncHandler(async (req, res) => {
    const pool = await getPool();
    const amazonUserId = req.amazonProfile.user_id;
    const userId = await ensureUser(pool, amazonUserId);

    const { id, name } = req.body || {};
    if (!id || !name) {
      return res.status(400).json({ error: "Provide {id, name}" });
    }

    await pool
      .request()
      .input("user_id", sql.UniqueIdentifier, userId)
      .input("device_id", sql.NVarChar(255), String(id))
      .input("device_name", sql.NVarChar(255), String(name))
      .query(`
        MERGE dbo.devices AS target
        USING (SELECT @user_id AS user_id, 'alexa' AS platform, @device_id AS device_id) AS src
        ON target.user_id = src.user_id AND target.platform = src.platform AND target.device_id = src.device_id
        WHEN MATCHED THEN
          UPDATE SET device_name = @device_name
        WHEN NOT MATCHED THEN
          INSERT (user_id, platform, device_id, device_name)
          VALUES (@user_id, 'alexa', @device_id, @device_name);
      `);

    res.json({ ok: true });
  })
);

// Schedules
app.get(
  "/api/user/schedules",
  requireAmazonAuth,
  asyncHandler(async (req, res) => {
    const pool = await getPool();
    const amazonUserId = req.amazonProfile.user_id;
    const userId = await ensureUser(pool, amazonUserId);

    const result = await pool
      .request()
      .input("user_id", sql.UniqueIdentifier, userId)
      .query(`
        SELECT id, schedule_type, time_of_day, days_mask, enabled, device_id, payload_json, created_at
        FROM dbo.schedules
        WHERE user_id = @user_id
        ORDER BY created_at DESC
      `);

    const out = result.recordset.map((x) => {
      let payload = null;
      try {
        payload = x.payload_json ? JSON.parse(x.payload_json) : null;
      } catch {
        payload = null;
      }

      return {
        id: x.id,
        scheduleType: x.schedule_type,
        timeOfDay: String(x.time_of_day).slice(0, 5),
        days: maskToDaysArray(x.days_mask),
        enabled: !!x.enabled,
        deviceId: x.device_id || null,
        payload,
        createdAt: x.created_at,
      };
    });

    res.json({ schedules: out });
  })
);

app.post(
  "/api/user/schedules",
  requireAmazonAuth,
  asyncHandler(async (req, res) => {
    const pool = await getPool();
    const amazonUserId = req.amazonProfile.user_id;
    const userId = await ensureUser(pool, amazonUserId);

    const body = req.body || {};
    const scheduleType = String(
      body.scheduleType || body.schedule_type || "tilawat"
    ).toLowerCase();
    const timeOfDay = String(body.timeOfDay || body.time_of_day || "").slice(0, 5);
    const daysMask = daysArrayToMask(body.days);
    const enabled = body.enabled === false ? 0 : 1;
    const deviceId =
      body.deviceId && String(body.deviceId).trim()
        ? String(body.deviceId).trim()
        : null;

    if (!/^\d{2}:\d{2}$/.test(timeOfDay)) {
      return res.status(400).json({ error: "timeOfDay must be HH:MM" });
    }

    if (scheduleType !== "tilawat") {
      return res
        .status(400)
        .json({ error: "scheduleType must be 'tilawat' for MVP" });
    }

    const payload = body.payload;
    if (!isObject(payload)) {
      return res.status(400).json({ error: "payload must be an object" });
    }

    const surahNumber = Number(payload.surahNumber);
    if (!Number.isFinite(surahNumber) || surahNumber < 1 || surahNumber > 114) {
      return res.status(400).json({ error: "payload.surahNumber must be 1..114" });
    }

    const payloadJson = JSON.stringify({
      surahNumber,
      title: payload.title ? String(payload.title) : null,
      reciterId: payload.reciterId ? String(payload.reciterId) : null,
    });

    const result = await pool
      .request()
      .input("user_id", sql.UniqueIdentifier, userId)
      .input("schedule_type", sql.NVarChar(20), scheduleType)
      .input("time_of_day", sql.Time, timeOfDay)
      .input("days_mask", sql.Int, daysMask)
      .input("enabled", sql.Bit, enabled)
      .input("device_id", sql.NVarChar(255), deviceId)
      .input("payload_json", sql.NVarChar(sql.MAX), payloadJson)
      .query(`
        INSERT INTO dbo.schedules (user_id, schedule_type, time_of_day, days_mask, enabled, device_id, payload_json)
        OUTPUT inserted.id AS id
        VALUES (@user_id, @schedule_type, @time_of_day, @days_mask, @enabled, @device_id, @payload_json)
      `);

    res.json({ ok: true, id: result.recordset[0]?.id });
  })
);

app.delete(
  "/api/user/schedules/:id",
  requireAmazonAuth,
  asyncHandler(async (req, res) => {
    const pool = await getPool();
    const amazonUserId = req.amazonProfile.user_id;
    const userId = await ensureUser(pool, amazonUserId);

    const id = String(req.params.id);

    await pool
      .request()
      .input("id", sql.UniqueIdentifier, id)
      .input("user_id", sql.UniqueIdentifier, userId)
      .query(`
        DELETE FROM dbo.schedules
        WHERE id = @id AND user_id = @user_id
      `);

    res.json({ ok: true });
  })
);

// Error handler
app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return next(err);

  const status = Number(err?.status || 500);
  res.status(status).json({
    error: String(err?.message || err || "Internal server error"),
  });
});

const port = Number(process.env.PORT || 4000);
app.listen(port, () => {
  console.log(`AdhanHome API listening on ${port}`);
});