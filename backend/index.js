// backend/index.js
require("dotenv").config();

// --- Crash visibility ---
process.on("unhandledRejection", (reason) => console.error("[unhandledRejection]", reason));
process.on("uncaughtException", (err) => console.error("[uncaughtException]", err));

const express = require("express");
const cors = require("cors");
const { getPool, closePool } = require("./db/sql");
const path = require("path");
// Prisma (Azure SQL)
const { prisma } = require("./db/prisma");

const duas = require("./data/duas.json");

const QURAN_API_BASE = "https://api.alquran.cloud/v1";
const ALADHAN_BASE = "https://api.aladhan.com/v1";

const NOMINATIM_BASE = "https://nominatim.openstreetmap.org";
const OVERPASS_BASE = "https://overpass-api.de/api/interpreter";

const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY || "";
const OPENCAGE_API_KEY = process.env.OPENCAGE_API_KEY || "";
const PRAYER_METHOD_DEFAULT = Number(process.env.PRAYER_METHOD_DEFAULT || 2);

// -------------------
// App + CORS
// -------------------
const app = express();

const defaultAllowedOrigins = [
  "http://localhost:5173",
  "http://localhost:4173",
  "https://nice-ground-009684610.1.azurestaticapps.net",
];

const envOrigins = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const allowedOrigins = [...new Set([...defaultAllowedOrigins, ...envOrigins])];

const corsOptions = {
  origin: (origin, callback) => {
    // Server-to-server (Alexa) calls often have no Origin header
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) return callback(null, true);

    // Optional: allow other Azure Static Apps preview domains without breaking CORS
    // Comment this out if you want strict allow-list only.
    try {
      const u = new URL(origin);
      if (u.hostname.endsWith("azurestaticapps.net")) return callback(null, true);
    } catch (_) { }

    return callback(null, false);
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  optionsSuccessStatus: 204,
  maxAge: 86400,
};

app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions)); // preflight for all routes (Express 5 safe)
app.use(express.json({ limit: "1mb" }));

// Serve audio files (if present in your deployment)
app.use("/audio", express.static(path.join(__dirname, "frontend", "public", "audio")));




// -------------------
// In-memory stores (only for non-auth/demo + non-prayer features)
// NOTE: Prayer Settings (sect/method/offsets/per-prayer quiet) are persisted in Azure SQL via Prisma.
// -------------------
const DEFAULT_SETTINGS = {
  language: "en",
  madhhab: "hanafi",
  shia: false,
  sect: "sunni",
  accountEnabled: false,

  // kept for backward-compat with older UI; DB is source of truth for authenticated users
  timingOffsets: { fajr: 0, sunrise: 0, dhuhr: 0, asr: 0, maghrib: 0, isha: 0 },

  calculationMethod: "isna",
  highLatitudeMethod: "automatic",

  country: "US",
  city: "Chicago",
  timezone: "America/Chicago",
  latitude: 41.8781,
  longitude: -87.6298,

  // Mosque selector (not yet persisted in DB in this milestone)
  mosqueId: null,
  mosqueName: null,
  mosqueAddress: null,
  mosqueLat: null,
  mosqueLng: null,

  // Legacy global quiet hours used by /api/test-adhan; per-prayer quiet hours are stored in DB
  quietHours: { enabled: true, from: "22:00", to: "07:00", muteFajr: true },
};

const settingsByAmazonUserId = new Map(); // demo-only or anon
const integrationsByAmazonUserId = new Map(); // integration status (still in-memory for now)

const DEMO_USER_KEY = "demo";

// -------------------
// Amazon helpers
// -------------------
async function fetchAmazonProfile(accessToken) {
  const resp = await fetch("https://api.amazon.com/user/profile", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!resp.ok) {
    const msg = await resp.text().catch(() => "");
    throw new Error(`Amazon profile failed: ${resp.status} ${msg}`);
  }
  // returns: { user_id, name, email }
  return resp.json();
}

function ensureSettings(userKey) {
  if (!settingsByAmazonUserId.has(userKey)) {
    settingsByAmazonUserId.set(userKey, structuredClone(DEFAULT_SETTINGS));
  }
  return settingsByAmazonUserId.get(userKey);
}

function ensureIntegration(userKey) {
  if (!integrationsByAmazonUserId.has(userKey)) {
    integrationsByAmazonUserId.set(userKey, {
      userKey,
      alexa: { connected: false, linkedAt: null, displayName: null, accountId: null },
      google: { connected: false, linkedAt: null },
      apple: { connected: false, linkedAt: null },
    });
  }
  return integrationsByAmazonUserId.get(userKey);
}

async function optionalAmazonAuth(req, _res, next) {
  const auth = req.headers.authorization || "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) return next();

  try {
    const profile = await fetchAmazonProfile(m[1]);
    req.amazonUser = profile; // { user_id, name, email }
  } catch (e) {
    // don’t hard-fail globally; some routes allow anonymous
    req.amazonUser = null;
  }
  next();
}

async function requireAmazonAuth(req, res, next) {
  const auth = req.headers.authorization || "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) return res.status(401).json({ error: "Missing Bearer token" });

  try {
    const profile = await fetchAmazonProfile(m[1]);
    req.amazonUser = profile;
    next();
  } catch (e) {
    return res.status(401).json({ error: "Invalid/expired Amazon token" });
  }
}

function getUserKeyFromReq(req) {
  return req.amazonUser?.user_id || DEMO_USER_KEY;
}

// -------------------
// DB: user bootstrap (creates profile + 5 prayer rows once)
// -------------------
async function getOrCreateUserByAmazonId(amazonUserId) {
  return prisma.user.upsert({
    where: { amazonUserId },
    update: {},
    create: {
      amazonUserId,
      profile: { create: {} },
      prayers: {
        create: ["fajr", "dhuhr", "asr", "maghrib", "isha"].map((p) => ({ prayerName: p })),
      },
    },
    include: { profile: true, prayers: true },
  });
}

// -------------------
// Small helpers
// -------------------
function pickDefined(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj || {})) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

function isHHMM(s) {
  return typeof s === "string" && /^\d{2}:\d{2}$/.test(s);
}

function addMinutesHHMM(hhmm, delta) {
  const [h, m] = String(hhmm).split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return hhmm;
  let t = h * 60 + m + (delta || 0);
  t = ((t % 1440) + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

function inQuietHours(nowHHMM, fromHHMM, toHHMM) {
  if (!isHHMM(nowHHMM) || !isHHMM(fromHHMM) || !isHHMM(toHHMM)) return false;
  const toMin = (s) => {
    const [h, m] = s.split(":").map(Number);
    return h * 60 + m;
  };
  const n = toMin(nowHHMM), f = toMin(fromHHMM), t = toMin(toHHMM);
  // handles overnight windows
  return f <= t ? (n >= f && n <= t) : (n >= f || n <= t);
}

function nowHHMMInLocalTZ(timezone) {
  // Minimal/cheap: use server local time if timezone is not set.
  // (Later we can use a TZ library if needed.)
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

async function getEffectiveSettings(req) {
  // If Amazon authenticated, pull from DB and merge onto DEFAULT_SETTINGS for compatibility.
  if (req.amazonUser?.user_id) {
    const user = await getOrCreateUserByAmazonId(req.amazonUser.user_id);
    const p = user.profile || {};

    const globalOffsets = {
      fajr: p.globalOffsetFajr ?? 0,
      sunrise: 0,
      dhuhr: p.globalOffsetDhuhr ?? 0,
      asr: p.globalOffsetAsr ?? 0,
      maghrib: p.globalOffsetMaghrib ?? 0,
      isha: p.globalOffsetIsha ?? 0,
    };

    const prayerByName = Object.fromEntries(
      (user.prayers || []).map((x) => [String(x.prayerName || "").toLowerCase(), x])
    );

    return {
      user,
      settings: {
        ...structuredClone(DEFAULT_SETTINGS),
        sect: String(p.sect || "SUNNI").toLowerCase(), // "sunni" | "shia"
        shia: String(p.sect || "").toUpperCase() === "SHIA",
        madhhab: String(p.madhhab || DEFAULT_SETTINGS.madhhab).toLowerCase(),
        calculationMethod: String(p.calculationMethod || DEFAULT_SETTINGS.calculationMethod),
        highLatitudeMethod: String(p.highLatitudeMethod || DEFAULT_SETTINGS.highLatitudeMethod),
        country: p.country || DEFAULT_SETTINGS.country,
        city: p.city || DEFAULT_SETTINGS.city,
        timezone: p.timezone || DEFAULT_SETTINGS.timezone,
        latitude: typeof p.latitude === "number" ? p.latitude : DEFAULT_SETTINGS.latitude,
        longitude: typeof p.longitude === "number" ? p.longitude : DEFAULT_SETTINGS.longitude,
        accountEnabled: !!p.accountEnabled,
        timingOffsets: globalOffsets,
      },
      prayerByName,
      globalOffsets,
    };
  }

  const userKey = getUserKeyFromReq(req);
  return { user: null, settings: ensureSettings(userKey), prayerByName: null, globalOffsets: null };
}

// -------------------
// Location helpers
// -------------------
const KNOWN_CITY_COORDS = {
  "us:chicago": { lat: 41.8781, lon: -87.6298, timezone: "America/Chicago", city: "Chicago", country: "US" },
  "pk:karachi": { lat: 24.8607, lon: 67.0011, timezone: "Asia/Karachi", city: "Karachi", country: "PK" },
  "pk:lahore": { lat: 31.5204, lon: 74.3587, timezone: "Asia/Karachi", city: "Lahore", country: "PK" },
  "pk:islamabad": { lat: 33.6844, lon: 73.0479, timezone: "Asia/Karachi", city: "Islamabad", country: "PK" },
};

function resolveCoordsFromSettings(settings, { city, country } = {}) {
  // Mosque selected
  if (
    settings?.mosqueId &&
    typeof settings?.mosqueLat === "number" &&
    typeof settings?.mosqueLng === "number"
  ) {
    return {
      lat: settings.mosqueLat,
      lon: settings.mosqueLng,
      timezone: settings.timezone || "America/Chicago",
      city: settings.city || "Chicago",
      country: settings.country || "US",
      source: "mosque",
    };
  }

  // Explicit lat/lon chosen
  if (typeof settings?.latitude === "number" && typeof settings?.longitude === "number") {
    return {
      lat: settings.latitude,
      lon: settings.longitude,
      timezone: settings.timezone || "America/Chicago",
      city: settings.city || "Chicago",
      country: settings.country || "US",
      source: "coords",
    };
  }

  const normalizedCity = String(city || settings?.city || "Chicago").trim().toLowerCase();
  const normalizedCountry = String(country || settings?.country || "US").trim().toLowerCase();

  const key = `${normalizedCountry}:${normalizedCity}`;
  if (KNOWN_CITY_COORDS[key]) return { ...KNOWN_CITY_COORDS[key], source: "known" };

  if (normalizedCountry === "pk") return { ...KNOWN_CITY_COORDS["pk:karachi"], source: "known" };
  return { ...KNOWN_CITY_COORDS["us:chicago"], source: "known" };
}

// -------------------
// Nominatim + Overpass (fallback, no keys)
// -------------------
async function nominatimSearch(query, countrycodes) {
  const url = new URL(`${NOMINATIM_BASE}/search`);
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");
  url.searchParams.set("addressdetails", "1");
  if (countrycodes) url.searchParams.set("countrycodes", countrycodes);

  const resp = await fetch(url.toString(), {
    headers: { "User-Agent": "AdhanHome/1.0 (contact: dev)" },
  });
  if (!resp.ok) throw new Error(`Nominatim HTTP ${resp.status}`);
  const data = await resp.json();
  if (!Array.isArray(data) || data.length === 0) return null;

  const item = data[0];
  return { lat: Number(item.lat), lon: Number(item.lon), displayName: item.display_name, address: item.address || {} };
}

function osmAddressFromTags(tags) {
  const parts = [];
  if (tags["addr:housenumber"]) parts.push(tags["addr:housenumber"]);
  if (tags["addr:street"]) parts.push(tags["addr:street"]);
  const street = parts.join(" ").trim();

  const city = tags["addr:city"] || tags["addr:town"] || tags["addr:village"] || "";
  const state = tags["addr:state"] || "";
  const postcode = tags["addr:postcode"] || "";
  const country = tags["addr:country"] || "";

  const out = [];
  if (street) out.push(street);
  if (city) out.push(city);
  if (state) out.push(state);
  if (postcode) out.push(postcode);
  if (country) out.push(country);
  return out.join(", ");
}

async function overpassMosquesAround(lat, lon, radiusMeters = 15000, limit = 30) {
  const query = `
[out:json][timeout:25];
(
  node["amenity"="place_of_worship"]["religion"="muslim"](around:${radiusMeters},${lat},${lon});
  way["amenity"="place_of_worship"]["religion"="muslim"](around:${radiusMeters},${lat},${lon});
  relation["amenity"="place_of_worship"]["religion"="muslim"](around:${radiusMeters},${lat},${lon});
);
out center tags;
`;
  const resp = await fetch(OVERPASS_BASE, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
      "User-Agent": "AdhanHome/1.0 (contact: dev)",
    },
    body: "data=" + encodeURIComponent(query),
  });

  if (!resp.ok) throw new Error(`Overpass HTTP ${resp.status}`);
  const json = await resp.json();
  const elements = Array.isArray(json.elements) ? json.elements : [];

  const mapped = elements
    .map((el) => {
      const tags = el.tags || {};
      const name = tags.name || "Mosque";
      const placeId = `osm:${el.type}:${el.id}`;
      const centerLat = el.lat ?? el.center?.lat;
      const centerLon = el.lon ?? el.center?.lon;
      if (typeof centerLat !== "number" || typeof centerLon !== "number") return null;
      return {
        placeId,
        name,
        address: osmAddressFromTags(tags),
        location: { lat: centerLat, lng: centerLon },
        source: "osm",
      };
    })
    .filter(Boolean);

  return mapped.slice(0, limit);
}

async function overpassLookupByPlaceId(placeId) {
  const parts = String(placeId || "").split(":");
  if (parts.length !== 3 || parts[0] !== "osm") return null;

  const type = parts[1];
  const id = parts[2];

  const query = `
[out:json][timeout:25];
${type}(${id});
out center tags;
`;

  const resp = await fetch(OVERPASS_BASE, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
      "User-Agent": "AdhanHome/1.0 (contact: dev)",
    },
    body: "data=" + encodeURIComponent(query),
  });

  if (!resp.ok) throw new Error(`Overpass HTTP ${resp.status}`);
  const json = await resp.json();
  const el = Array.isArray(json.elements) ? json.elements[0] : null;
  if (!el) return null;

  const tags = el.tags || {};
  const centerLat = el.lat ?? el.center?.lat;
  const centerLon = el.lon ?? el.center?.lon;
  if (typeof centerLat !== "number" || typeof centerLon !== "number") return null;

  return {
    placeId: `osm:${el.type}:${el.id}`,
    name: tags.name || "Mosque",
    address: osmAddressFromTags(tags),
    location: { lat: centerLat, lng: centerLon },
    source: "osm",
  };
}

// -------------------
// Prayer times helpers (AlAdhan)
// -------------------
function toDDMMYYYY(isoDate) {
  const [y, m, d] = String(isoDate).split("-");
  return `${d}-${m}-${y}`;
}
function addDaysISO(isoDate, days) {
  const dt = new Date(`${isoDate}T12:00:00`);
  dt.setDate(dt.getDate() + days);
  return dt.toISOString().slice(0, 10);
}
function stripAladhanTime(v) {
  return String(v ?? "").trim().split(" ")[0];
}
function to12h(hhmm) {
  const s = stripAladhanTime(hhmm);
  const [hStr, mStr] = s.split(":");
  const h = Number(hStr);
  const m = Number(mStr);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return s;
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

// Map your stored method keys to AlAdhan method numbers
function aladhanMethodNumber(methodLike, fallback) {
  if (typeof methodLike === "string" && /^\d+$/.test(methodLike.trim())) return Number(methodLike.trim());
  if (typeof methodLike === "number" && Number.isFinite(methodLike)) return methodLike;

  const s = String(methodLike ?? "").toLowerCase().trim();
  if (s === "karachi") return 1;
  if (s === "isna") return 2;
  if (s === "mwl") return 3;
  if (s === "umm-al-qura" || s === "umm_al_qura" || s === "makkah") return 4;
  if (s === "egypt") return 5;
  if (s === "tehran") return 7;
  if (s === "jafari") return 0;

  return Number(fallback || 2);
}

async function aladhanTimingsByCoords(lat, lng, isoDate, methodNum, madhhab) {
  const dateParam = toDDMMYYYY(isoDate);
  const school = String(madhhab || "shafi").toLowerCase() === "hanafi" ? 1 : 0;

  const url =
    `${ALADHAN_BASE}/timings/${dateParam}` +
    `?latitude=${encodeURIComponent(lat)}` +
    `&longitude=${encodeURIComponent(lng)}` +
    `&method=${encodeURIComponent(methodNum)}` +
    `&school=${encodeURIComponent(school)}`;

  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`AlAdhan HTTP ${resp.status}`);
  const json = await resp.json();

  const t = json?.data?.timings;
  const tz = json?.data?.meta?.timezone || null;
  if (!t) return null;

  const prayers24 = {
    fajr: stripAladhanTime(t.Fajr),
    sunrise: stripAladhanTime(t.Sunrise),
    dhuhr: stripAladhanTime(t.Dhuhr),
    asr: stripAladhanTime(t.Asr),
    maghrib: stripAladhanTime(t.Maghrib),
    isha: stripAladhanTime(t.Isha),
  };

  const prayers = {
    fajr: to12h(prayers24.fajr),
    sunrise: to12h(prayers24.sunrise),
    dhuhr: to12h(prayers24.dhuhr),
    asr: to12h(prayers24.asr),
    maghrib: to12h(prayers24.maghrib),
    isha: to12h(prayers24.isha),
  };

  return { prayers, prayers24, timezone: tz, meta: json?.data?.meta || null };
}

async function aladhanCalendarByCoords(lat, lng, year, month, methodNum, madhhab) {
  const school = String(madhhab || "shafi").toLowerCase() === "hanafi" ? 1 : 0;

  const url =
    `${ALADHAN_BASE}/calendar` +
    `?latitude=${encodeURIComponent(lat)}` +
    `&longitude=${encodeURIComponent(lng)}` +
    `&method=${encodeURIComponent(methodNum)}` +
    `&school=${encodeURIComponent(school)}` +
    `&month=${encodeURIComponent(month)}` +
    `&year=${encodeURIComponent(year)}`;

  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`AlAdhan calendar HTTP ${resp.status}`);
  const json = await resp.json();
  const days = Array.isArray(json?.data) ? json.data : [];
  return days
    .map((d) => {
      const iso = d?.date?.gregorian?.date
        ? (() => {
          const [dd, mm, yy] = String(d.date.gregorian.date).split("-");
          return `${yy}-${mm}-${dd}`;
        })()
        : null;

      const t = d?.timings || {};
      return {
        date: iso,
        prayers: {
          fajr: to12h(t.Fajr),
          sunrise: to12h(t.Sunrise),
          dhuhr: to12h(t.Dhuhr),
          asr: to12h(t.Asr),
          maghrib: to12h(t.Maghrib),
          isha: to12h(t.Isha),
        },
      };
    })
    .filter((x) => x.date);
}

// -------------------
// BASIC ROUTES
// -------------------
app.get("/", (_req, res) => res.status(200).send("OK"));
app.get("/health", (_req, res) => res.status(200).send("ok"));
app.get("/api/health", (_req, res) =>
  res.json({ ok: true, service: "adhanhome-backend", ts: new Date().toISOString() })
);

// -------------------
// Endppoint for DB SQL
app.get("/api/db-test", async (req, res) => {
  if (
    !process.env.DB_SERVER ||
    !process.env.DB_NAME ||
    !process.env.DB_USER ||
    !process.env.DB_PASSWORD
  ) {
    return res.status(503).json({ ok: false, error: "DB env vars missing" });
  }

  try {
    const pool = await getPool();
    const r = await pool.request().query(`
      SELECT
        DB_NAME() AS db_name,
        SUSER_SNAME() AS login_name,
        SYSDATETIMEOFFSET() AS now_utc
    `);
    res.json({ ok: true, result: r.recordset[0] });
  } catch (e) {
    res.status(500).json({
      ok: false,
      error: e.message,
      code: e.code,
      number: e.number,
    });
  }
});




// -------------------
// Geocoding
// -------------------
app.get("/api/geocode", async (req, res) => {
  const { city, country } = req.query;
  if (!city || !country) return res.status(400).json({ error: "city and country are required" });

  const q = `${city}, ${country}`;

  // Preferred: OpenCage
  if (OPENCAGE_API_KEY) {
    try {
      const url =
        `https://api.opencagedata.com/geocode/v1/json` +
        `?q=${encodeURIComponent(q)}` +
        `&key=${OPENCAGE_API_KEY}` +
        `&no_annotations=0` +
        `&limit=1`;

      const resp = await fetch(url);
      if (!resp.ok) return res.status(502).json({ error: "Geocoding provider error" });

      const data = await resp.json();
      const r = data?.results?.[0];
      if (!r?.geometry) return res.status(404).json({ error: "Location not found" });

      const tz = r?.annotations?.timezone?.name || null;

      return res.json({
        query: q,
        city,
        country,
        lat: r.geometry.lat,
        lng: r.geometry.lng,
        timezone: tz,
        source: "opencage",
      });
    } catch (err) {
      console.error("[geocode] OpenCage error:", err);
      return res.status(502).json({ error: "Geocoding failed" });
    }
  }

  // Fallback: Nominatim
  try {
    const cc =
      String(country).toLowerCase() === "us"
        ? "us"
        : String(country).toLowerCase() === "pk"
          ? "pk"
          : undefined;

    const hit = await nominatimSearch(q, cc);
    if (!hit) return res.status(404).json({ error: "Location not found" });

    return res.json({
      query: q,
      city,
      country,
      lat: hit.lat,
      lng: hit.lon,
      timezone: null,
      source: "nominatim",
    });
  } catch (err) {
    console.error("[geocode] Nominatim error:", err);
    return res.status(502).json({ error: "Geocoding failed" });
  }
});

// -------------------
// DUA endpoints
// -------------------
app.get("/api/duas/categories", (_req, res) => {
  const counts = {};
  for (const d of (duas || [])) {
    const cat = String(d.category || "Other");
    counts[cat] = (counts[cat] || 0) + 1;
  }

  const categories = Object.keys(counts)
    .sort((a, b) => a.localeCompare(b))
    .map((title) => ({
      id: title.toLowerCase().replace(/\s+/g, "-"),
      title,
      count: counts[title],
      audioUrl: null,
    }));

  res.json({ categories });
});

app.get("/api/duas", (req, res) => {
  const category = String(req.query.category || req.query.categoryId || "").trim().toLowerCase();
  const search = String(req.query.search || req.query.q || "").trim().toLowerCase();

  const results = (duas || []).filter((d) => {
    const matchCategory = !category || String(d.category || "").toLowerCase() === category;
    const haystack =
      `${d.title || ""} ${d.textArabic || ""} ${d.textTransliteration || ""} ${d.textTranslation || ""}`.toLowerCase();
    const matchSearch = !search || haystack.includes(search);
    return matchCategory && matchSearch;
  });

  res.json({ count: results.length, duas: results });
});

app.get("/api/duas/:id", (req, res) => {
  const dua = (duas || []).find((d) => String(d.id) === String(req.params.id));
  if (!dua) return res.status(404).json({ error: "Dua not found" });
  res.json(dua);
});

// -------------------
// Qur'an endpoints
// -------------------
app.get("/api/quran/surahs", async (_req, res) => {
  try {
    const apiRes = await fetch(`${QURAN_API_BASE}/surah`);
    if (!apiRes.ok) return res.status(502).json({ error: "Failed to fetch surahs from Qur'an API" });

    const body = await apiRes.json();
    const surahs = (body.data || []).map((s) => ({
      id: s.number,
      number: s.number,
      nameArabic: s.name,
      nameEnglish: s.englishName,
      englishNameTranslation: s.englishNameTranslation,
      ayahCount: s.numberOfAyahs,
      revelationType: s.revelationType,
    }));

    res.json({ count: surahs.length, surahs });
  } catch (err) {
    console.error("Error fetching surahs:", err);
    res.status(500).json({ error: "Internal error fetching surahs" });
  }
});

app.get("/api/quran/surahs/:id", async (req, res) => {
  const surahId = req.params.id;
  try {
    const [audioRes, translationRes] = await Promise.all([
      fetch(`${QURAN_API_BASE}/surah/${surahId}/ar.alafasy`),
      fetch(`${QURAN_API_BASE}/surah/${surahId}/en.sahih`),
    ]);

    if (!audioRes.ok) return res.status(502).json({ error: "Failed to fetch surah audio from Qur'an API" });
    if (!translationRes.ok) return res.status(502).json({ error: "Failed to fetch surah translation from Qur'an API" });

    const audioJson = await audioRes.json();
    const translationJson = await translationRes.json();

    let transliterationData = null;
    try {
      const translitRes = await fetch(`${QURAN_API_BASE}/surah/${surahId}/en.transliteration`);
      if (translitRes.ok) transliterationData = (await translitRes.json()).data;
    } catch (_) { }

    const s = audioJson.data;
    const t = translationJson.data;
    const tr = transliterationData;

    const verses = (s.ayahs || []).map((a, idx) => {
      const tAyah = t.ayahs && t.ayahs[idx];
      const trAyah = tr && tr.ayahs && tr.ayahs[idx];
      return {
        numberInSurah: a.numberInSurah,
        textArabic: a.text,
        textTranslation: tAyah ? tAyah.text : null,
        textTransliteration: trAyah ? trAyah.text : null,
        audioUrl: a.audio,
        audioVariants: a.audioSecondary || [],
      };
    });

    res.json({
      id: s.number,
      number: s.number,
      nameArabic: s.name,
      nameEnglish: s.englishName,
      englishNameTranslation: s.englishNameTranslation,
      ayahCount: s.numberOfAyahs,
      revelationType: s.revelationType,
      verses,
    });
  } catch (err) {
    console.error("Error fetching surah detail:", err);
    res.status(500).json({ error: "Internal error fetching surah detail" });
  }
});

// -------------------
// Integrations (Amazon / Alexa)
// -------------------
app.use("/api/integrations", optionalAmazonAuth);

app.get("/api/integrations", (req, res) => {
  const userKey = getUserKeyFromReq(req);
  res.json(ensureIntegration(userKey));
});

// Legacy mock link kept for local UI testing
app.post("/api/integrations/alexa/mock-link", (req, res) => {
  const userKey = DEMO_USER_KEY;
  const now = new Date().toISOString();
  const status = ensureIntegration(userKey);

  status.alexa = {
    connected: true,
    linkedAt: now,
    displayName: "demo-user@amazon.com",
    accountId: "amazon-demo-account-123",
  };

  integrationsByAmazonUserId.set(userKey, status);
  res.json({ success: true, alexa: status.alexa, userKey });
});

app.post("/api/integrations/alexa/login", async (req, res) => {
  const { accessToken } = req.body || {};
  if (!accessToken) return res.status(400).json({ error: "Missing accessToken" });

  try {
    const profile = await fetchAmazonProfile(accessToken);
    const userKey = profile.user_id;

    const now = new Date().toISOString();
    const status = ensureIntegration(userKey);

    status.alexa = {
      connected: true,
      linkedAt: now,
      displayName: profile.email || profile.name || "Amazon account",
      accountId: profile.user_id,
    };

    integrationsByAmazonUserId.set(userKey, status);

    // ensure demo settings bucket exists (non-DB things)
    ensureSettings(userKey);

    // Bootstrap DB user row too (production)
    await getOrCreateUserByAmazonId(userKey);

    return res.json({ success: true, profile, alexa: status.alexa, userKey });
  } catch (err) {
    console.error("[alexa/login] verify failed:", err);
    return res.status(401).json({ error: "Invalid/expired Amazon token" });
  }
});

app.post("/api/integrations/alexa/disconnect", requireAmazonAuth, (req, res) => {
  const userKey = getUserKeyFromReq(req);
  const status = ensureIntegration(userKey);

  status.alexa = { connected: false, linkedAt: null, displayName: null, accountId: null };
  integrationsByAmazonUserId.set(userKey, status);

  res.json({ success: true, alexa: status.alexa, userKey });
});

// -------------------
// User settings (DB-backed for authenticated users)
// -------------------
app.get("/api/user/settings", requireAmazonAuth, async (req, res) => {
  const amazonUserId = req.amazonUser.user_id;
  const user = await getOrCreateUserByAmazonId(amazonUserId);

  res.json({
    userKey: amazonUserId,
    profile: user.profile,
    prayers: (user.prayers || [])
      .map((p) => ({
        id: p.id,
        prayerName: p.prayerName,
        enabled: p.enabled,
        offsetMin: p.offsetMin,
        quietEnabled: p.quietEnabled,
        quietFrom: p.quietFrom,
        quietTo: p.quietTo,
      }))
      .sort((a, b) => a.prayerName.localeCompare(b.prayerName)),
  });
});

app.put("/api/user/settings", requireAmazonAuth, async (req, res) => {
  const amazonUserId = req.amazonUser.user_id;
  const user = await getOrCreateUserByAmazonId(amazonUserId);

  const body = req.body || {};

  if (body.profile) {
    const d = pickDefined({
      sect: body.profile.sect,
      calculationMethod: body.profile.calculationMethod,
      madhhab: body.profile.madhhab,
      highLatitudeMethod: body.profile.highLatitudeMethod,
      timezone: body.profile.timezone,
      country: body.profile.country,
      city: body.profile.city,
      latitude: body.profile.latitude,
      longitude: body.profile.longitude,
      accountEnabled: body.profile.accountEnabled,
      globalOffsetFajr: body.profile.globalOffsetFajr,
      globalOffsetDhuhr: body.profile.globalOffsetDhuhr,
      globalOffsetAsr: body.profile.globalOffsetAsr,
      globalOffsetMaghrib: body.profile.globalOffsetMaghrib,
      globalOffsetIsha: body.profile.globalOffsetIsha,
    });

    await prisma.userProfile.update({
      where: { userId: user.id },
      data: d,
    });
  }

  if (Array.isArray(body.prayers)) {
    for (const p of body.prayers) {
      const d = pickDefined({
        enabled: p.enabled,
        offsetMin: p.offsetMin,
        quietEnabled: p.quietEnabled,
        quietFrom: p.quietFrom,
        quietTo: p.quietTo,
      });

      // basic validation to avoid garbage rows
      if (d.quietFrom && !isHHMM(d.quietFrom)) return res.status(400).json({ error: "quietFrom must be HH:MM" });
      if (d.quietTo && !isHHMM(d.quietTo)) return res.status(400).json({ error: "quietTo must be HH:MM" });

      await prisma.prayerConfig.update({
        where: { id: p.id },
        data: d,
      });
    }
  }

  res.json({ ok: true });
});

// -------------------
// Prayer Times (timezone-correct via AlAdhan) + DB offsets + per-prayer quiet/enabled
// -------------------
app.get("/api/prayer-times/today", optionalAmazonAuth, async (req, res) => {
  try {
    const isoDate =
      typeof req.query.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date)
        ? req.query.date
        : new Date().toISOString().slice(0, 10);

    const { user, settings, prayerByName, globalOffsets } = await getEffectiveSettings(req);

    // allow query overrides but keep settings as default
    const effective = {
      ...settings,
      city: req.query.city || settings.city,
      country: req.query.country || settings.country,
      calculationMethod: req.query.method || settings.calculationMethod,
      madhhab: req.query.madhhab || settings.madhhab,
      shia: req.query.shia === "true" ? true : settings.shia,
      timezone: req.query.timezone || settings.timezone,
    };

    const coords = resolveCoordsFromSettings(effective, { city: effective.city, country: effective.country });
    const methodNum = aladhanMethodNumber(effective.calculationMethod, PRAYER_METHOD_DEFAULT);

    const timings = await aladhanTimingsByCoords(coords.lat, coords.lon, isoDate, methodNum, effective.madhhab);
    if (!timings) return res.status(502).json({ error: "Failed to fetch timings" });

    const tomorrowISO = addDaysISO(isoDate, 1);
    const tomorrow = await aladhanTimingsByCoords(coords.lat, coords.lon, tomorrowISO, methodNum, effective.madhhab);

    // Apply DB offsets if authenticated
    let prayers24 = { ...timings.prayers24 };
    if (user && prayerByName && globalOffsets) {
      const names = ["fajr", "dhuhr", "asr", "maghrib", "isha"];
      for (const n of names) {
        const per = prayerByName[n];
        const perOffset = per?.offsetMin ?? 0;
        const gOff = globalOffsets[n] ?? 0;
        prayers24[n] = addMinutesHHMM(prayers24[n], gOff + perOffset);
      }
    }

    const prayers = {
      fajr: to12h(prayers24.fajr),
      sunrise: to12h(prayers24.sunrise),
      dhuhr: to12h(prayers24.dhuhr),
      asr: to12h(prayers24.asr),
      maghrib: to12h(prayers24.maghrib),
      isha: to12h(prayers24.isha),
    };

    // playAllowed: based on enabled + per-prayer quiet
    let playAllowed = null;
    if (user && prayerByName) {
      const nowHHMM = nowHHMMInLocalTZ(effective.timezone);
      playAllowed = {};
      for (const n of ["fajr", "dhuhr", "asr", "maghrib", "isha"]) {
        const cfg = prayerByName[n];
        const enabled = cfg?.enabled !== false;
        const quiet =
          !!cfg?.quietEnabled && inQuietHours(nowHHMM, cfg?.quietFrom || "00:00", cfg?.quietTo || "00:00");
        playAllowed[n] = enabled && !quiet;
      }
    }

    return res.json({
      date: isoDate,
      location: { city: effective.city, country: effective.country, timezone: timings.timezone || effective.timezone },
      source: coords.source,
      mosque:
        coords.source === "mosque"
          ? {
            id: effective.mosqueId,
            name: effective.mosqueName,
            address: effective.mosqueAddress,
            location: { lat: effective.mosqueLat, lng: effective.mosqueLng },
          }
          : null,
      settingsUsed: {
        method: effective.calculationMethod,
        madhhab: effective.madhhab,
        shia: !!effective.shia,
        highLatitudeMethod: effective.highLatitudeMethod,
      },
      prayers,
      prayers24,
      playAllowed,
      nextFajr: tomorrow?.prayers?.fajr || null,
      nextFajrDate: tomorrowISO,
      meta: {
        provider: "aladhan",
        method: methodNum,
        school: String(effective.madhhab).toLowerCase() === "hanafi" ? 1 : 0,
        dbBacked: !!user,
      },
    });
  } catch (err) {
    console.error("Error in /api/prayer-times/today:", err);
    return res.status(500).json({ error: "Failed to compute today's prayer times." });
  }
});

app.get("/api/prayer-times/month", optionalAmazonAuth, async (req, res) => {
  try {
    const { settings } = await getEffectiveSettings(req);

    const monthParam = String(req.query.month || "").trim(); // "YYYY-MM"
    let year, month;
    if (/^\d{4}-\d{2}$/.test(monthParam)) {
      year = Number(monthParam.slice(0, 4));
      month = Number(monthParam.slice(5, 7));
    } else {
      const now = new Date();
      year = now.getFullYear();
      month = now.getMonth() + 1;
    }

    const effective = {
      ...settings,
      city: req.query.city || settings.city,
      country: req.query.country || settings.country,
      calculationMethod: req.query.method || settings.calculationMethod,
      madhhab: req.query.madhhab || settings.madhhab,
      shia: req.query.shia === "true" ? true : settings.shia,
    };

    const coords = resolveCoordsFromSettings(effective, { city: effective.city, country: effective.country });
    const methodNum = aladhanMethodNumber(effective.calculationMethod, PRAYER_METHOD_DEFAULT);

    const days = await aladhanCalendarByCoords(coords.lat, coords.lon, year, month, methodNum, effective.madhhab);

    return res.json({
      location: { city: effective.city, country: effective.country },
      month: `${year}-${String(month).padStart(2, "0")}`,
      source: coords.source,
      days,
      meta: { provider: "aladhan", method: methodNum },
    });
  } catch (err) {
    console.error("Error in /api/prayer-times/month:", err);
    return res.status(500).json({ error: "Failed to fetch monthly prayer times." });
  }
});

// -------------------
// Mosque search
// -------------------
app.get("/api/mosques", optionalAmazonAuth, async (req, res) => {
  const { settings } = await getEffectiveSettings(req);

  const { query = "", city = "", bias = "user", radiusKm = "15", country = "" } = req.query;

  const q = String(query || city || "").trim();
  const radiusMeters = Math.max(1, Number(radiusKm) || 15) * 1000;

  // Preferred: Google Places
  if (GOOGLE_PLACES_API_KEY) {
    try {
      const region = String(settings.country || "US").toLowerCase();
      let url = "";

      if (bias === "user") {
        const coords = resolveCoordsFromSettings(settings);
        url =
          `https://maps.googleapis.com/maps/api/place/nearbysearch/json` +
          `?location=${coords.lat},${coords.lon}` +
          `&radius=${Math.round(radiusMeters)}` +
          `&type=${encodeURIComponent("mosque")}` +
          `&keyword=${encodeURIComponent(q || "mosque")}` +
          `&key=${GOOGLE_PLACES_API_KEY}`;
      } else {
        const text = `mosque in ${q || settings.city || "your area"}`;
        url =
          `https://maps.googleapis.com/maps/api/place/textsearch/json` +
          `?query=${encodeURIComponent(text)}` +
          `&type=${encodeURIComponent("mosque")}` +
          `&region=${encodeURIComponent(region)}` +
          `&key=${GOOGLE_PLACES_API_KEY}`;
      }

      const resp = await fetch(url);
      if (!resp.ok) return res.status(502).json({ error: "Failed to fetch mosques" });

      const data = await resp.json();
      if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
        return res.status(502).json({
          error: "Unexpected response from Google Places",
          apiStatus: data.status,
          apiError: data.error_message ?? null,
        });
      }

      const mosques = (data.results || []).map((m) => ({
        placeId: m.place_id,
        name: m.name,
        address: m.vicinity || m.formatted_address || "",
        rating: m.rating ?? null,
        userRatingsTotal: m.user_ratings_total ?? null,
        location: m.geometry?.location ? { lat: m.geometry.location.lat, lng: m.geometry.location.lng } : null,
        source: "google",
      }));

      return res.json({ count: mosques.length, mosques });
    } catch (err) {
      console.error("[mosques] Google Places error:", err);
      return res.status(502).json({ error: "Failed to fetch mosques" });
    }
  }

  // Fallback: OSM
  try {
    let centerLat = null;
    let centerLon = null;

    if (bias === "user") {
      const coords = resolveCoordsFromSettings(settings);
      centerLat = coords.lat;
      centerLon = coords.lon;
    } else {
      const hintCountry =
        String(country).toLowerCase() === "us"
          ? "us"
          : String(country).toLowerCase() === "pk"
            ? "pk"
            : String(settings.country || "").toLowerCase() === "pk"
              ? "pk"
              : String(settings.country || "").toLowerCase() === "us"
                ? "us"
                : undefined;

      const hit = await nominatimSearch(q || `${settings.city}, ${settings.country}`, hintCountry);
      if (!hit) return res.json({ count: 0, mosques: [] });

      centerLat = hit.lat;
      centerLon = hit.lon;
    }

    const mosques = await overpassMosquesAround(centerLat, centerLon, radiusMeters, 30);
    return res.json({ count: mosques.length, mosques });
  } catch (err) {
    console.error("[mosques] OSM fallback error:", err);
    return res.status(502).json({ error: "Failed to fetch mosques" });
  }
});

app.get("/api/mosques/:placeId/times", optionalAmazonAuth, async (req, res) => {
  try {
    const { settings } = await getEffectiveSettings(req);

    const { placeId } = req.params;
    const dateStr =
      typeof req.query.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date)
        ? req.query.date
        : new Date().toISOString().slice(0, 10);

    const methodNum = aladhanMethodNumber(settings.calculationMethod, PRAYER_METHOD_DEFAULT);

    // OSM lookup
    if (String(placeId).startsWith("osm:")) {
      const details = await overpassLookupByPlaceId(placeId);
      if (!details?.location) return res.status(404).json({ error: "Mosque not found" });

      const timings = await aladhanTimingsByCoords(
        details.location.lat,
        details.location.lng,
        dateStr,
        methodNum,
        settings.madhhab
      );

      return res.json({
        date: dateStr,
        mosque: details,
        prayers: timings?.prayers || null,
        source: "aladhan",
      });
    }

    // Google place details
    if (!GOOGLE_PLACES_API_KEY) {
      return res.status(500).json({
        error: "Mosque times by Google Place ID require GOOGLE_PLACES_API_KEY. Configure it or use OSM results.",
      });
    }

    const detailsUrl =
      `https://maps.googleapis.com/maps/api/place/details/json` +
      `?place_id=${encodeURIComponent(placeId)}` +
      `&fields=name,formatted_address,geometry` +
      `&key=${GOOGLE_PLACES_API_KEY}`;

    const detailsResp = await fetch(detailsUrl);
    if (!detailsResp.ok) return res.status(502).json({ error: "Failed to fetch mosque details" });

    const detailsData = await detailsResp.json();
    const result = detailsData.result;
    if (!result?.geometry?.location) return res.status(404).json({ error: "Mosque location not found" });

    const timings = await aladhanTimingsByCoords(
      result.geometry.location.lat,
      result.geometry.location.lng,
      dateStr,
      methodNum,
      settings.madhhab
    );

    return res.json({
      date: dateStr,
      mosque: {
        placeId,
        name: result.name,
        address: result.formatted_address,
        location: { lat: result.geometry.location.lat, lng: result.geometry.location.lng },
        source: "google",
      },
      prayers: timings?.prayers || null,
      source: "aladhan",
    });
  } catch (err) {
    console.error("[mosque times] error:", err);
    return res.status(502).json({ error: "Failed to compute mosque times" });
  }
});

// -------------------
// Test adhan (quiet hours)
// -------------------
// For authenticated users you can pass ?prayer=fajr|dhuhr|asr|maghrib|isha to enforce per-prayer quiet hours.
app.post("/api/test-adhan", optionalAmazonAuth, async (req, res) => {
  const prayer = String(req.query.prayer || "fajr").toLowerCase();
  const { user, settings, prayerByName } = await getEffectiveSettings(req);

  if (user && prayerByName && prayerByName[prayer]) {
    const cfg = prayerByName[prayer];
    const nowHHMM = nowHHMMInLocalTZ(settings.timezone);

    const quiet =
      !!cfg.quietEnabled && inQuietHours(nowHHMM, cfg.quietFrom || "00:00", cfg.quietTo || "00:00");

    if (!cfg.enabled) {
      return res.json({ success: true, played: false, reason: "disabled", message: `${prayer} is disabled.` });
    }
    if (quiet) {
      return res.json({ success: true, played: false, reason: "quiet-hours", message: "Muted due to quiet hours." });
    }
    return res.json({ success: true, played: true, reason: "ok", message: "Test Adhan triggered (db-backed)." });
  }

  // fallback legacy global quiet hours
  const userKey = getUserKeyFromReq(req);
  const legacy = ensureSettings(userKey);
  const now = new Date();
  const quiet = legacy.quietHours || {};
  const inQ = (() => {
    if (!quiet || !quiet.enabled) return false;
    const { from, to } = quiet;
    if (!from || !to) return false;

    const [fromH, fromM] = from.split(":").map(Number);
    const [toH, toM] = to.split(":").map(Number);
    if ([fromH, fromM, toH, toM].some((n) => Number.isNaN(n))) return false;

    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const fromMinutes = fromH * 60 + fromM;
    const toMinutes = toH * 60 + toM;

    if (fromMinutes === toMinutes) return true;
    if (fromMinutes < toMinutes) return currentMinutes >= fromMinutes && currentMinutes < toMinutes;
    return currentMinutes >= fromMinutes || currentMinutes < toMinutes;
  })();

  if (inQ) {
    return res.json({
      success: true,
      played: false,
      reason: "quiet-hours",
      quietHours: quiet,
      message: "Adhan muted because it is within quiet hours.",
    });
  }

  return res.json({
    success: true,
    played: true,
    reason: "ok",
    quietHours: quiet,
    message: "Test Adhan triggered (legacy demo)",
  });
});

// -------------------
// Qiblah
// -------------------
const KAABA_COORDS = { lat: 21.4225, lon: 39.8262 };
function toRadians(deg) { return (deg * Math.PI) / 180; }
function toDegrees(rad) {
  let deg = (rad * 180) / Math.PI;
  if (deg < 0) deg += 360;
  return deg;
}
function calculateQiblahBearing(lat, lon) {
  const lat1 = toRadians(lat);
  const lon1 = toRadians(lon);
  const lat2 = toRadians(KAABA_COORDS.lat);
  const lon2 = toRadians(KAABA_COORDS.lon);
  const dLon = lon2 - lon1;

  const y = Math.sin(dLon) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);

  return toDegrees(Math.atan2(y, x));
}
function bearingToDirection(bearing) {
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW", "N"];
  const idx = Math.round(bearing / 45);
  return dirs[idx];
}

app.get("/api/qiblah", (req, res) => {
  const { lat, lng } = req.query;
  const latitude = parseFloat(lat);
  const longitude = parseFloat(lng);

  if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
    return res.status(400).json({
      error: "Provide lat & lng, e.g. /api/qiblah?lat=41.8781&lng=-87.6298",
    });
  }

  const bearing = calculateQiblahBearing(latitude, longitude);
  const direction = bearingToDirection(bearing);

  res.json({
    location: { lat: latitude, lon: longitude },
    kaaba: KAABA_COORDS,
    bearing,
    direction,
    source: "formula",
    message: `Face ${Math.round(bearing)}° from true north (${direction}).`,
  });
});

// -------------------
// Start server + graceful shutdown (Azure App Service)
// -------------------
const PORT = Number(process.env.PORT) || 8080;

const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`Backend listening on ${PORT}`);
});

async function shutdown(signal) {
  console.log(`[shutdown] received ${signal}`);

  // stop accepting new connections
  server.close(async () => {
    try {
      await closePool();
      console.log("[shutdown] db pool closed");
    } catch (e) {
      console.error("[shutdown] closePool failed:", e);
    }
    console.log("[shutdown] http server closed");
    process.exit(0);
  });

  // hard-exit if stuck
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));