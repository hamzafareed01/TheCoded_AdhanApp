const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const dotenv = require("dotenv");
const fs = require("fs");
const path = require("path");

dotenv.config();

const { getPool, sql } = require("./db/sql");

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(helmet());
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: false }));

const PRAYERS = ["fajr", "dhuhr", "asr", "maghrib", "isha"];
const AMAZON_TOKEN_CACHE_TTL_MS = 5 * 60 * 1000;
const GOOGLE_PLACES_BASE = "https://places.googleapis.com/v1";
const tokenCache = new Map();

const corsOriginsRaw = process.env.CORS_ORIGINS || "";
const allowedOrigins = corsOriginsRaw
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const corsOptions = {
  origin(origin, cb) {
    if (!origin) return cb(null, true);
    if (allowedOrigins.length === 0) return cb(null, true);
    if (allowedOrigins.includes(origin)) return cb(null, true);
    return cb(new Error(`CORS blocked for origin: ${origin}`), false);
  },
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

function asyncHandler(fn) {
  return function wrapped(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function readJsonFile(relativePath) {
  const full = path.join(__dirname, relativePath);
  const raw = fs.readFileSync(full, "utf8");
  return JSON.parse(raw);
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

function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function normalizeCountryInput(value, fallback = "US") {
  const raw = String(value || fallback).trim().replace(/\s+/g, " ");
  if (!raw) return fallback;
  if (/^[A-Za-z]{2}$/.test(raw)) return raw.toUpperCase();
  return raw;
}

function resolveCountryName(value) {
  const raw = normalizeCountryInput(value, "US");

  if (!/^[A-Z]{2}$/.test(raw)) {
    return raw;
  }

  if (raw === "US") return "United States";
  if (raw === "PK") return "Pakistan";

  try {
    const displayNames = new Intl.DisplayNames(["en"], { type: "region" });
    return displayNames.of(raw) || raw;
  } catch {
    return raw;
  }
}

function getPlacesRegionCode(value) {
  const raw = normalizeCountryInput(value, "");
  return /^[A-Z]{2}$/.test(raw) ? raw : undefined;
}

function guessTimezoneFallback(country) {
  const code = getPlacesRegionCode(country);
  if (code === "PK") return "Asia/Karachi";
  if (code === "US") return "America/Chicago";
  return "Etc/UTC";
}

function normalizeTimeString(value, fallback) {
  const s = String(value || "").trim();
  return /^\d{2}:\d{2}$/.test(s) ? s : fallback;
}

function normalizeQueryText(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function normalizeMosqueSearchText(query, countryValue) {
  const q = normalizeQueryText(query);
  const countryName = resolveCountryName(countryValue);

  if (!q) return `mosques in ${countryName}`;
  if (/mosque|masjid/i.test(q)) return countryName ? `${q}, ${countryName}` : q;
  return countryName ? `mosques in ${q}, ${countryName}` : `mosques in ${q}`;
}

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

  if (String(sect || "").toUpperCase() === "SHIA") return 0;
  if (m.includes("karachi")) return 1;
  if (m.includes("isna")) return 2;
  if (m.includes("mwl")) return 3;
  if (m.includes("umm")) return 4;
  if (m.includes("makkah")) return 4;
  if (m.includes("egypt")) return 5;
  if (m.includes("tehran")) return 7;

  return 2;
}

function madhhabToSchool(madhhab) {
  return String(madhhab || "").toLowerCase() === "hanafi" ? 1 : 0;
}

function daysArrayToMask(days) {
  if (!Array.isArray(days) || days.length !== 7) return 127;
  let mask = 0;
  for (let i = 0; i < 7; i += 1) {
    if (days[i]) mask |= 1 << i;
  }
  return mask;
}

function maskToDaysArray(mask) {
  const m = Number(mask || 127);
  return Array.from({ length: 7 }, (_, i) => ((m >> i) & 1) === 1);
}

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

function getTimePartsInTimeZone(timeZone) {
  try {
    const formatter = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

    const parts = formatter.formatToParts(new Date());
    const hour = Number(parts.find((p) => p.type === "hour")?.value ?? NaN);
    const minute = Number(parts.find((p) => p.type === "minute")?.value ?? NaN);
    const second = Number(parts.find((p) => p.type === "second")?.value ?? NaN);

    if ([hour, minute, second].some(Number.isNaN)) return null;
    return { hour, minute, second };
  } catch {
    return null;
  }
}

function hhmmToSeconds(value) {
  const match = String(value || "").trim().match(/^(\d{2}):(\d{2})$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return hour * 3600 + minute * 60;
}

function isWithinQuietWindow(nowSeconds, fromHHMM, toHHMM) {
  const from = hhmmToSeconds(fromHHMM);
  const to = hhmmToSeconds(toHHMM);
  if (from == null || to == null) return false;
  if (from === to) return true;
  if (from < to) return nowSeconds >= from && nowSeconds < to;
  return nowSeconds >= from || nowSeconds < to;
}

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

  const resp = await fetch("https://api.amazon.com/user/profile", {
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

async function ensureUser(pool, amazonUserId) {
  const tx = new sql.Transaction(pool);
  await tx.begin();

  try {
    const merged = await new sql.Request(tx)
      .input("amazon_user_id", sql.NVarChar(255), amazonUserId)
      .query(`
        MERGE dbo.users AS target
        USING (SELECT @amazon_user_id AS amazon_user_id) AS src
        ON target.amazon_user_id = src.amazon_user_id
        WHEN NOT MATCHED THEN
          INSERT (amazon_user_id) VALUES (src.amazon_user_id)
        OUTPUT inserted.id AS id;
      `);

    const userId = merged.recordset[0].id;

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

function buildUserSettingsPayload(amazonUserId, profile, prayerRows) {
  const rows = Array.isArray(prayerRows) ? prayerRows : [];

  const firstQuietRow =
    rows.find((r) => r.quiet_enabled || r.quiet_from || r.quiet_to) || rows[0] || {};

  const quietHours = {
    enabled: !!firstQuietRow.quiet_enabled,
    from: firstQuietRow.quiet_from
      ? String(firstQuietRow.quiet_from).slice(0, 5)
      : "22:00",
    to: firstQuietRow.quiet_to ? String(firstQuietRow.quiet_to).slice(0, 5) : "07:00",
    muteFajr: true,
  };

  const prayerConfigs = rows.map((row) => {
    let afterPayload = null;
    try {
      afterPayload = row.after_payload_json ? JSON.parse(row.after_payload_json) : null;
    } catch {
      afterPayload = null;
    }

    return {
      prayerName: row.prayer_name,
      enabled: !!row.enabled,
      offsetMin: row.offset_min || 0,
      quietEnabled: !!row.quiet_enabled,
      quietFrom: row.quiet_from ? String(row.quiet_from).slice(0, 5) : "22:00",
      quietTo: row.quiet_to ? String(row.quiet_to).slice(0, 5) : "07:00",
      adhanReciterId: row.adhan_reciter_id || null,
      afterAdhan: {
        type: row.after_type || "none",
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
    timezone: profile.timezone || guessTimezoneFallback(profile.country),
    latitude: typeof profile.latitude === "number" ? profile.latitude : null,
    longitude: typeof profile.longitude === "number" ? profile.longitude : null,
    mosqueId: profile.mosque_id || null,
    mosqueName: profile.mosque_name || null,
    mosqueAddress: profile.mosque_address || null,
    mosqueLat: typeof profile.mosque_lat === "number" ? profile.mosque_lat : null,
    mosqueLng: typeof profile.mosque_lng === "number" ? profile.mosque_lng : null,
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

async function googlePlacesPost(endpoint, body, fieldMask) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    const err = new Error("GOOGLE_PLACES_API_KEY is not configured");
    err.status = 500;
    throw err;
  }

  const resp = await fetch(`${GOOGLE_PLACES_BASE}${endpoint}`, {
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

app.get("/", (req, res) => {
  res.json({ ok: true, service: "adhanhome-api" });
});

app.get("/health", (req, res) => res.json({ ok: true }));
app.get("/api/health", (req, res) => res.json({ ok: true }));

app.get(
  "/api/geocode",
  asyncHandler(async (req, res) => {
    const city = normalizeQueryText(req.query.city || "");
    const country = normalizeCountryInput(req.query.country || "US");

    if (!city) {
      return res.status(400).json({ error: "city is required" });
    }

    const apiKey = process.env.OPENCAGE_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "OPENCAGE_API_KEY is not configured" });
    }

    const countryName = resolveCountryName(country);
    const q = encodeURIComponent(`${city}, ${countryName}`);
    const url = `https://api.opencagedata.com/geocode/v1/json?q=${q}&key=${apiKey}&limit=1&no_annotations=0`;

    const upstream = await fetch(url);
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
    const timezone = first?.annotations?.timezone?.name || guessTimezoneFallback(country);

    res.json({
      lat,
      lng,
      timezone,
      formatted: first.formatted || null,
    });
  })
);

app.get(
  "/api/integrations",
  requireAmazonAuth,
  asyncHandler(async (req, res) => {
    const profile = req.amazonProfile;

    res.json({
      userKey: profile.user_id,
      amazon: {
        connected: true,
        email: profile.email || null,
      },
      alexa: {
        connected: true,
        linkedAt: null,
        displayName: profile.name || null,
        accountId: profile.user_id || null,
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

app.post("/api/integrations/alexa/disconnect", (req, res) => {
  res.json({ ok: true });
});

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

app.get(
  "/api/duas",
  asyncHandler(async (req, res) => {
    const data = readJsonFile(path.join("data", "duas.json"));
    res.json(data);
  })
);

app.get(
  "/api/mosques",
  requireAmazonAuth,
  asyncHandler(async (req, res) => {
    const pool = await getPool();
    const { profile } = await getUserProfileAndPrayers(pool, req.amazonProfile.user_id);

    const country = normalizeCountryInput(req.query.country || profile.country || "US");
    const regionCode = getPlacesRegionCode(country);
    const query = normalizeQueryText(req.query.query || profile.city || "Chicago");
    const bias = String(req.query.bias || "user").trim().toLowerCase();
    const radiusKm = clampNumber(req.query.radiusKm, 1, 50, 25);
    const radiusMeters = radiusKm * 1000;

    const hasUserCoords =
      typeof profile.latitude === "number" &&
      Number.isFinite(profile.latitude) &&
      typeof profile.longitude === "number" &&
      Number.isFinite(profile.longitude);

    let source = "text";
    let placesJson;

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
    } else {
      const body = {
        textQuery: normalizeMosqueSearchText(query, country),
        includedType: "mosque",
        strictTypeFiltering: true,
        maxResultCount: 20,
      };
      if (regionCode) body.regionCode = regionCode;

      placesJson = await googlePlacesPost(
        "/places:searchText",
        body,
        "places.id,places.name,places.displayName,places.formattedAddress,places.location"
      );
    }

    const mosques = dedupeMosques(
      Array.isArray(placesJson?.places)
        ? placesJson.places.map(normalizePlace).filter((m) => m.placeId && m.name)
        : []
    );

    res.json({
      query,
      country,
      source,
      mosques,
    });
  })
);

app.get(
  "/api/qiblah",
  asyncHandler(async (req, res) => {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(400).json({ error: "lat and lng query params are required numbers" });
    }

    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return res.status(400).json({ error: "lat/lng out of valid range" });
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

app.get(
  "/api/quran/surahs",
  asyncHandler(async (req, res) => {
    const resp = await fetch("https://api.alquran.cloud/v1/surah");
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
      fetch(`https://api.alquran.cloud/v1/surah/${id}/${arabicEdition}`),
      fetch(`https://api.alquran.cloud/v1/surah/${id}/${transEdition}`),
      fetch(`https://api.alquran.cloud/v1/surah/${id}/${audioEdition}`),
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

    const ayahs = arabicAyahs.map((ayah, idx) => ({
      numberInSurah: ayah.numberInSurah,
      arabic: ayah.text,
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
  const country = body.country;
  const city = body.city;
  const timezone = body.timezone;
  const latitude = parseOptionalNumber(body.latitude);
  const longitude = parseOptionalNumber(body.longitude);
  const accountEnabled = body.accountEnabled ?? body.account_enabled;

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

  const profileReq = pool.request().input("user_id", sql.UniqueIdentifier, userId);

  if (sect !== undefined) profileReq.input("sect", sql.NVarChar(10), String(sect).toUpperCase());
  if (calc !== undefined) profileReq.input("calc", sql.NVarChar(50), String(calc));
  if (madhhab !== undefined) profileReq.input("madhhab", sql.NVarChar(20), String(madhhab));
  if (high !== undefined) profileReq.input("high", sql.NVarChar(30), String(high));
  if (language !== undefined) profileReq.input("language", sql.NVarChar(10), String(language));
  if (country !== undefined) profileReq.input("country", sql.NVarChar(64), String(country));
  if (city !== undefined) profileReq.input("city", sql.NVarChar(128), String(city));
  if (timezone !== undefined) profileReq.input("timezone", sql.NVarChar(64), String(timezone));
  if (latitude !== undefined) profileReq.input("latitude", sql.Float, latitude);
  if (longitude !== undefined) profileReq.input("longitude", sql.Float, longitude);
  if (accountEnabled !== undefined) {
    profileReq.input("account_enabled", sql.Bit, accountEnabled ? 1 : 0);
  }

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
    hasMosqueAddress ? (body.mosqueAddress ? String(body.mosqueAddress) : null) : null
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
  if (quietHours && typeof quietHours === "object") {
    const quietEnabled = quietHours.enabled ? 1 : 0;
    const quietFrom = normalizeTimeString(quietHours.from, "22:00");
    const quietTo = normalizeTimeString(quietHours.to, "07:00");

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

      const setEnabled = hasOwn(pc, "enabled") || hasOwn(pc, "enabled");
      const setOffsetMin = hasOwn(pc, "offsetMin") || hasOwn(pc, "offset_min");
      const setQuietEnabled = hasOwn(pc, "quietEnabled") || hasOwn(pc, "quiet_enabled");
      const setQuietFrom = hasOwn(pc, "quietFrom") || hasOwn(pc, "quiet_from");
      const setQuietTo = hasOwn(pc, "quietTo") || hasOwn(pc, "quiet_to");
      const setAdhanReciterId = hasOwn(pc, "adhanReciterId") || hasOwn(pc, "adhan_reciter_id");
      const setAfterAdhan = hasOwn(pc, "afterAdhan") || hasOwn(pc, "after_type") || hasOwn(pc, "after_payload") || hasOwn(pc, "after_payload_json");

      const afterType = String(pc.afterAdhan?.type || pc.after_type || "none").toLowerCase();
      const afterPayload = pc.afterAdhan?.payload ?? pc.after_payload ?? null;
      const afterPayloadJson = afterPayload ? JSON.stringify(afterPayload) : null;

      await pool
        .request()
        .input("user_id", sql.UniqueIdentifier, userId)
        .input("prayer_name", sql.NVarChar(10), prayerName)
        .input("set_enabled", sql.Bit, setEnabled ? 1 : 0)
        .input("enabled", sql.Bit, setEnabled ? (pc.enabled === false ? 0 : 1) : null)
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
        .input("quiet_from", sql.Time, setQuietFrom ? pc.quietFrom || null : null)
        .input("set_quiet_to", sql.Bit, setQuietTo ? 1 : 0)
        .input("quiet_to", sql.Time, setQuietTo ? pc.quietTo || null : null)
        .input("set_adhan_reciter_id", sql.Bit, setAdhanReciterId ? 1 : 0)
        .input(
          "adhan_reciter_id",
          sql.NVarChar(64),
          setAdhanReciterId ? pc.adhanReciterId || null : null
        )
        .input("set_after_type", sql.Bit, setAfterAdhan ? 1 : 0)
        .input("after_type", sql.NVarChar(16), setAfterAdhan ? afterType : null)
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

app.get(
  "/api/prayer-times/today",
  requireAmazonAuth,
  asyncHandler(async (req, res) => {
    const pool = await getPool();
    const amazonUserId = req.amazonProfile.user_id;
    const { profile, prayers } = await getUserProfileAndPrayers(pool, amazonUserId);

    const perPrayerOffset = {};
    const enabledMap = {};
    for (const row of prayers) {
      perPrayerOffset[row.prayer_name] = row.offset_min || 0;
      enabledMap[row.prayer_name] = !!row.enabled;
    }

    const method = mapCalcMethodToAlAdhan(
      profile.calculation_method || "isna",
      profile.sect || "SUNNI"
    );
    const school = madhhabToSchool(profile.madhhab || "hanafi");

    const hasCoords =
      typeof profile.latitude === "number" &&
      Number.isFinite(profile.latitude) &&
      typeof profile.longitude === "number" &&
      Number.isFinite(profile.longitude);

    const countryName = resolveCountryName(profile.country || "US");
    const url = hasCoords
      ? `https://api.aladhan.com/v1/timings?latitude=${encodeURIComponent(
          profile.latitude
        )}&longitude=${encodeURIComponent(profile.longitude)}&method=${method}&school=${school}`
      : `https://api.aladhan.com/v1/timingsByCity?city=${encodeURIComponent(
          profile.city || "Chicago"
        )}&country=${encodeURIComponent(countryName)}&method=${method}&school=${school}`;

    const resp = await fetch(url);
    if (!resp.ok) {
      return res.status(502).json({ error: "Prayer API upstream failed" });
    }

    const json = await resp.json();
    const timings = json?.data?.timings || {};

    const base24 = {
      fajr: String(timings.Fajr || "").slice(0, 5),
      sunrise: String(timings.Sunrise || "").slice(0, 5),
      dhuhr: String(timings.Dhuhr || "").slice(0, 5),
      asr: String(timings.Asr || "").slice(0, 5),
      maghrib: String(timings.Maghrib || "").slice(0, 5),
      isha: String(timings.Isha || "").slice(0, 5),
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
      maghrib: addMinutesHHMM(base24.maghrib, globalOffsets.maghrib + (perPrayerOffset.maghrib || 0)),
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

    res.json({
      location: {
        city: profile.city || "Chicago",
        country: profile.country || "US",
        timezone: profile.timezone || guessTimezoneFallback(profile.country),
        latitude: hasCoords ? profile.latitude : null,
        longitude: hasCoords ? profile.longitude : null,
      },
      mosque: {
        id: profile.mosque_id || null,
        name: profile.mosque_name || null,
        address: profile.mosque_address || null,
        latitude: typeof profile.mosque_lat === "number" ? profile.mosque_lat : null,
        longitude: typeof profile.mosque_lng === "number" ? profile.mosque_lng : null,
      },
      method: {
        sect: profile.sect || "SUNNI",
        calculationMethod: profile.calculation_method || "isna",
        madhhab: profile.madhhab || "hanafi",
      },
      source: hasCoords ? "coordinates" : "city",
      enabled: enabledMap,
      prayers24: adjusted24,
      prayers12: adjusted12,
      date: json?.data?.date || null,
      meta: json?.data?.meta || null,
    });
  })
);

app.post(
  "/api/test-adhan",
  requireAmazonAuth,
  asyncHandler(async (req, res) => {
    const pool = await getPool();
    const amazonUserId = req.amazonProfile.user_id;
    const { profile, prayers } = await getUserProfileAndPrayers(pool, amazonUserId);

    const quietRow = prayers.find((row) => row.quiet_enabled && row.quiet_from && row.quiet_to);
    if (!quietRow) {
      return res.json({ ok: true, muted: false, message: "Sample Adhan allowed." });
    }

    const timeZone = profile.timezone || guessTimezoneFallback(profile.country);
    const nowParts = getTimePartsInTimeZone(timeZone);
    if (!nowParts) {
      return res.json({ ok: true, muted: false, message: "Sample Adhan allowed." });
    }

    const nowSeconds = nowParts.hour * 3600 + nowParts.minute * 60 + nowParts.second;
    const quietFrom = String(quietRow.quiet_from).slice(0, 5);
    const quietTo = String(quietRow.quiet_to).slice(0, 5);
    const muted = isWithinQuietWindow(nowSeconds, quietFrom, quietTo);

    return res.json({
      ok: true,
      muted,
      message: muted
        ? `Within quiet hours (${quietFrom}-${quietTo}) in ${timeZone}.`
        : "Sample Adhan allowed.",
    });
  })
);

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

    const out = result.recordset.map((row) => {
      let payload = null;
      try {
        payload = row.payload_json ? JSON.parse(row.payload_json) : null;
      } catch {
        payload = null;
      }

      return {
        id: row.id,
        scheduleType: row.schedule_type,
        timeOfDay: String(row.time_of_day).slice(0, 5),
        days: maskToDaysArray(row.days_mask),
        enabled: !!row.enabled,
        deviceId: row.device_id || null,
        payload,
        createdAt: row.created_at,
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
    const scheduleType = String(body.scheduleType || body.schedule_type || "tilawat").toLowerCase();
    const timeOfDay = String(body.timeOfDay || body.time_of_day || "").slice(0, 5);
    const daysMask = daysArrayToMask(body.days);
    const enabled = body.enabled === false ? 0 : 1;
    const deviceId = body.deviceId ? String(body.deviceId) : null;

    if (!/^\d{2}:\d{2}$/.test(timeOfDay)) {
      return res.status(400).json({ error: "timeOfDay must be HH:MM" });
    }

    if (scheduleType !== "tilawat") {
      return res.status(400).json({ error: "scheduleType must be 'tilawat' for MVP" });
    }

    const payload = body.payload;
    if (!payload || typeof payload !== "object") {
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
