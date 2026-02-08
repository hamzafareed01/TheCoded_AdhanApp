// backend/index.js
require("dotenv").config();

// --- Crash visibility (prevents silent exit during dev) ---
process.on("unhandledRejection", (reason) => console.error("[unhandledRejection]", reason));
process.on("uncaughtException", (err) => console.error("[uncaughtException]", err));

const express = require("express");
const cors = require("cors");
const adhan = require("adhan");
const path = require("path");

const duas = require("./data/duas.json");

// External APIs
const QURAN_API_BASE = "https://api.alquran.cloud/v1";
const ALADHAN_BASE = "https://api.aladhan.com/v1";
const NOMINATIM_BASE = "https://nominatim.openstreetmap.org";
const OVERPASS_BASE = "https://overpass-api.de/api/interpreter";

// Keys / env
const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY || "";
const OPENCAGE_API_KEY = process.env.OPENCAGE_API_KEY || "";
const PRAYER_METHOD_DEFAULT = Number(process.env.PRAYER_METHOD_DEFAULT || 2);

// Azure App Service will set PORT; local dev can default to 4000
const PORT = Number(process.env.PORT || 4000);

// ------------------------------
// App + CORS
// ------------------------------
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
  origin: (origin, cb) => {
    if (!origin) return cb(null, true); // curl/postman/no-origin
    if (allowedOrigins.includes(origin)) return cb(null, true);
    return cb(null, false);
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  optionsSuccessStatus: 204,
  maxAge: 86400,
};

app.use(cors(corsOptions));
app.use(express.json({ limit: "1mb" }));

// Static (optional) - only works if you actually have these files in repo
app.use("/audio", express.static(path.join(__dirname, "frontend", "public", "audio")));

// ------------------------------
// Helpers (safe clone)
// ------------------------------
function clone(obj) {
  if (typeof global.structuredClone === "function") return structuredClone(obj);
  return JSON.parse(JSON.stringify(obj));
}

// ------------------------------
// Settings (DEMO + per Amazon user)
// ------------------------------
const DEFAULT_SETTINGS = {
  language: "en",
  madhhab: "hanafi",
  shia: false,
  calculationMethod: "isna",
  highLatitudeMethod: "middle_of_the_night",
  country: "US",
  city: "Chicago",
  timezone: "America/Chicago",
  latitude: 41.8781,
  longitude: -87.6298,
  mosqueId: null,
  mosqueName: null,
  mosqueAddress: null,
  mosqueLat: null,
  mosqueLng: null,
  quietHours: { enabled: true, from: "22:00", to: "07:00", muteFajr: true },
};

// Demo settings used when NO Amazon token is sent
let demoSettings = clone(DEFAULT_SETTINGS);

// Per-amazon-user settings (in-memory for now)
const settingsByAmazonUserId = new Map();
function getAmazonUserSettings(amazonUserId) {
  if (!settingsByAmazonUserId.has(amazonUserId)) {
    settingsByAmazonUserId.set(amazonUserId, clone(DEFAULT_SETTINGS));
  }
  return settingsByAmazonUserId.get(amazonUserId);
}

// ------------------------------
// Login with Amazon helpers
// ------------------------------
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

function getBearerToken(req) {
  const auth = req.headers.authorization || "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}

async function tryResolveAmazonUser(req) {
  const token = getBearerToken(req);
  if (!token) return null;
  try {
    const profile = await fetchAmazonProfile(token);
    return { token, profile };
  } catch {
    return null;
  }
}

// ------------------------------
// Integrations state (demo + per user)
// ------------------------------
let demoIntegrationStatus = {
  alexa: { connected: false, linkedAt: null, displayName: null, accountId: null },
  google: { connected: false, linkedAt: null },
  apple: { connected: false, linkedAt: null },
};

const integrationByAmazonUserId = new Map();
function getIntegrationForAmazonUser(amazonUserId) {
  if (!integrationByAmazonUserId.has(amazonUserId)) {
    integrationByAmazonUserId.set(amazonUserId, clone(demoIntegrationStatus));
  }
  return integrationByAmazonUserId.get(amazonUserId);
}

// ------------------------------
// Geocoding fallbacks
// ------------------------------
async function nominatimSearch(query, countrycodes) {
  const url = new URL(`${NOMINATIM_BASE}/search`);
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");
  url.searchParams.set("addressdetails", "1");
  if (countrycodes) url.searchParams.set("countrycodes", countrycodes);

  const resp = await fetch(url.toString(), {
    headers: { "User-Agent": "TheCodedAdhanApp/1.0" },
  });
  if (!resp.ok) throw new Error(`Nominatim HTTP ${resp.status}`);
  const data = await resp.json();
  if (!Array.isArray(data) || data.length === 0) return null;

  const item = data[0];
  return {
    lat: Number(item.lat),
    lon: Number(item.lon),
    displayName: item.display_name,
    address: item.address || {},
  };
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
      "User-Agent": "TheCodedAdhanApp/1.0",
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

      const address = osmAddressFromTags(tags);
      return {
        placeId,
        name,
        address,
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
      "User-Agent": "TheCodedAdhanApp/1.0",
    },
    body: "data=" + encodeURIComponent(query),
  });
  if (!resp.ok) throw new Error(`Overpass HTTP ${resp.status}`);
  const json = await resp.json();
  const el = Array.isArray(json.elements) ? json.elements[0] : null;
  if (!el) return null;

  const tags = el.tags || {};
  const name = tags.name || "Mosque";
  const centerLat = el.lat ?? el.center?.lat;
  const centerLon = el.lon ?? el.center?.lon;
  if (typeof centerLat !== "number" || typeof centerLon !== "number") return null;

  return {
    placeId: `osm:${el.type}:${el.id}`,
    name,
    address: osmAddressFromTags(tags),
    location: { lat: centerLat, lng: centerLon },
    source: "osm",
  };
}

// ------------------------------
// Prayer time helpers (AlAdhan + adhan-js)
// ------------------------------
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

function aladhanMethodNumber(methodLike, fallback) {
  if (typeof methodLike === "string" && /^\d+$/.test(methodLike.trim())) return Number(methodLike.trim());
  if (typeof methodLike === "number" && Number.isFinite(methodLike)) return methodLike;

  const s = String(methodLike ?? "").toLowerCase().trim();
  if (s === "karachi") return 1;
  if (s === "isna") return 2;

  return Number(fallback || 2);
}

async function aladhanTimingsByCoords(lat, lng, isoDate, methodNum) {
  const dateParam = toDDMMYYYY(isoDate);

  const url =
    `${ALADHAN_BASE}/timings/${dateParam}` +
    `?latitude=${encodeURIComponent(lat)}` +
    `&longitude=${encodeURIComponent(lng)}` +
    `&method=${encodeURIComponent(methodNum)}`;

  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`AlAdhan HTTP ${resp.status}`);

  const json = await resp.json();
  const t = json?.data?.timings;
  if (!t) return null;

  return {
    fajr: stripAladhanTime(t.Fajr),
    sunrise: stripAladhanTime(t.Sunrise),
    dhuhr: stripAladhanTime(t.Dhuhr),
    asr: stripAladhanTime(t.Asr),
    maghrib: stripAladhanTime(t.Maghrib),
    isha: stripAladhanTime(t.Isha),
  };
}

const KNOWN_CITY_COORDS = {
  "us:chicago": { lat: 41.8781, lon: -87.6298, timezone: "America/Chicago", city: "Chicago", country: "US" },
  "pk:karachi": { lat: 24.8607, lon: 67.0011, timezone: "Asia/Karachi", city: "Karachi", country: "PK" },
  "pk:lahore": { lat: 31.5204, lon: 74.3587, timezone: "Asia/Karachi", city: "Lahore", country: "PK" },
  "pk:islamabad": { lat: 33.6844, lon: 73.0479, timezone: "Asia/Karachi", city: "Islamabad", country: "PK" },
};

function resolveCoordinatesFromSettings(settings, overrides = {}) {
  const s = { ...settings, ...overrides };

  // If we already have explicit coordinates, use them
  if (typeof s.latitude === "number" && typeof s.longitude === "number") {
    return {
      lat: s.latitude,
      lon: s.longitude,
      timezone: s.timezone || "America/Chicago",
      city: s.city || "Chicago",
      country: s.country || "US",
    };
  }

  const normalizedCity = String(s.city || "").trim().toLowerCase();
  const normalizedCountry = String(s.country || "US").trim().toLowerCase();

  const key = `${normalizedCountry}:${normalizedCity}`;
  if (KNOWN_CITY_COORDS[key]) return KNOWN_CITY_COORDS[key];

  if (normalizedCountry === "pk") return KNOWN_CITY_COORDS["pk:karachi"];
  return KNOWN_CITY_COORDS["us:chicago"];
}

function buildPrayerTimesForDate({ dateISO, settings, overrides = {} }) {
  const resolved = resolveCoordinatesFromSettings(settings, overrides);
  const coordinates = new adhan.Coordinates(resolved.lat, resolved.lon);

  const methodToUse = (overrides.method || settings.calculationMethod || "isna").toLowerCase();
  let params;
  switch (methodToUse) {
    case "makkah": params = adhan.CalculationMethod.Makkah(); break;
    case "egypt": params = adhan.CalculationMethod.Egyptian(); break;
    case "karachi": params = adhan.CalculationMethod.Karachi(); break;
    case "mwl": params = adhan.CalculationMethod.MuslimWorldLeague(); break;
    case "isna":
    default: params = adhan.CalculationMethod.NorthAmerica(); break;
  }

  const madhhabToUse = (overrides.madhhab || settings.madhhab || "shafi").toLowerCase();
  params.madhab = madhhabToUse === "hanafi" ? adhan.Madhab.Hanafi : adhan.Madhab.Shafi;

  const highLatSetting = (overrides.highLatitudeMethod || settings.highLatitudeMethod || "automatic").toLowerCase();
  switch (highLatSetting) {
    case "middle_of_the_night": params.highLatitudeRule = adhan.HighLatitudeRule.MiddleOfTheNight; break;
    case "one_seventh": params.highLatitudeRule = adhan.HighLatitudeRule.SeventhOfTheNight; break;
    case "angle_based": params.highLatitudeRule = adhan.HighLatitudeRule.TwilightAngle; break;
    default: break;
  }

  const dateForCalc = new Date(`${dateISO}T12:00:00`);
  const pt = new adhan.PrayerTimes(coordinates, dateForCalc, params);

  const fmt = (d) =>
    d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });

  return {
    date: dateISO,
    location: { city: resolved.city, country: resolved.country, timezone: resolved.timezone },
    source: "calculation",
    mosque: null,
    settingsUsed: {
      method: methodToUse,
      madhhab: madhhabToUse,
      shia: !!(overrides.shia ?? settings.shia),
      highLatitudeMethod: highLatSetting,
    },
    prayers: {
      fajr: fmt(pt.fajr),
      sunrise: fmt(pt.sunrise),
      dhuhr: fmt(pt.dhuhr),
      asr: fmt(pt.asr),
      maghrib: fmt(pt.maghrib),
      isha: fmt(pt.isha),
    },
  };
}

// ------------------------------
// Quiet hours helper
// ------------------------------
function isWithinQuietHours(now, quietHours) {
  if (!quietHours || !quietHours.enabled) return false;
  const { from, to } = quietHours;
  if (!from || !to) return false;

  const [fromH, fromM] = from.split(":").map(Number);
  const [toH, toM] = to.split(":").map(Number);
  if ([fromH, fromM, toH, toM].some((n) => Number.isNaN(n))) return false;

  const current = now.getHours() * 60 + now.getMinutes();
  const fromMin = fromH * 60 + fromM;
  const toMin = toH * 60 + toM;

  if (fromMin === toMin) return true;
  if (fromMin < toMin) return current >= fromMin && current < toMin;
  return current >= fromMin || current < toMin;
}

// ------------------------------
// BASIC ROUTES
// ------------------------------
app.get("/", (req, res) => res.status(200).send("OK"));
app.get("/health", (req, res) => res.status(200).send("ok"));
app.get("/api/health", (req, res) => {
  res.json({ ok: true, service: "adhanhome-backend", ts: new Date().toISOString() });
});

// ------------------------------
// AUTH (MVP – demo login)
// ------------------------------
const mockUsers = [
  { id: "demo-user-1", email: "demo@adhan.app", password: "password123", name: "Demo User" },
];

app.post("/api/auth/login", (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: "Email and password are required" });

  const user = mockUsers.find((u) => u.email === email);
  if (!user || user.password !== password) return res.status(401).json({ error: "Invalid email or password" });

  return res.json({ userId: user.id, email: user.email, name: user.name });
});

// ------------------------------
// INTEGRATIONS (Alexa)
// ------------------------------
app.get("/api/integrations", async (req, res) => {
  const resolved = await tryResolveAmazonUser(req);
  if (!resolved) return res.json({ user: "demo", ...demoIntegrationStatus });

  const amazonUserId = resolved.profile.user_id;
  const s = getIntegrationForAmazonUser(amazonUserId);
  return res.json({ user: amazonUserId, ...s });
});

// Login: frontend sends accessToken, backend verifies it and stores link status per amazon user
app.post("/api/integrations/alexa/login", async (req, res) => {
  const { accessToken } = req.body || {};
  if (!accessToken) return res.status(400).json({ error: "Missing accessToken" });

  try {
    const profile = await fetchAmazonProfile(accessToken);
    const now = new Date().toISOString();

    const amazonUserId = profile.user_id;
    const s = getIntegrationForAmazonUser(amazonUserId);

    s.alexa = {
      connected: true,
      linkedAt: now,
      displayName: profile.email || profile.name || "Amazon user",
      accountId: amazonUserId,
    };

    integrationByAmazonUserId.set(amazonUserId, s);

    return res.json({ success: true, amazonUserId, alexa: s.alexa, profile });
  } catch (e) {
    console.error("[alexa login]", e);
    return res.status(401).json({ error: "Invalid/expired Amazon token" });
  }
});

app.post("/api/integrations/alexa/disconnect", async (req, res) => {
  const resolved = await tryResolveAmazonUser(req);

  if (!resolved) {
    demoIntegrationStatus.alexa = { connected: false, linkedAt: null, displayName: null, accountId: null };
    return res.json({ success: true, user: "demo", alexa: demoIntegrationStatus.alexa });
  }

  const amazonUserId = resolved.profile.user_id;
  const s = getIntegrationForAmazonUser(amazonUserId);
  s.alexa = { connected: false, linkedAt: null, displayName: null, accountId: null };
  integrationByAmazonUserId.set(amazonUserId, s);

  return res.json({ success: true, user: amazonUserId, alexa: s.alexa });
});

// ------------------------------
// USER SETTINGS (demo OR per Amazon user)
// ------------------------------
app.get("/api/user/settings", async (req, res) => {
  const resolved = await tryResolveAmazonUser(req);
  if (!resolved) return res.json({ user: "demo", settings: demoSettings });

  const amazonUserId = resolved.profile.user_id;
  const settings = getAmazonUserSettings(amazonUserId);
  return res.json({ user: amazonUserId, settings });
});

app.post("/api/user/settings", async (req, res) => {
  const resolved = await tryResolveAmazonUser(req);

  const target = resolved
    ? getAmazonUserSettings(resolved.profile.user_id)
    : demoSettings;

  const b = req.body || {};

  // Merge only allowed fields (prevents random junk overwriting objects)
  const next = {
    ...target,
    ...(b.language && { language: b.language }),
    ...(b.madhhab && { madhhab: b.madhhab }),
    ...(typeof b.shia === "boolean" && { shia: b.shia }),
    ...(b.calculationMethod && { calculationMethod: b.calculationMethod }),
    ...(b.highLatitudeMethod && { highLatitudeMethod: b.highLatitudeMethod }),
    ...(b.country && { country: b.country }),
    ...(b.city && { city: b.city }),
    ...(b.timezone && { timezone: b.timezone }),
    ...(typeof b.latitude === "number" && { latitude: b.latitude }),
    ...(typeof b.longitude === "number" && { longitude: b.longitude }),
    ...(b.mosqueId !== undefined && { mosqueId: b.mosqueId }),
    ...(b.mosqueName !== undefined && { mosqueName: b.mosqueName }),
    ...(b.mosqueAddress !== undefined && { mosqueAddress: b.mosqueAddress }),
    ...(typeof b.mosqueLat === "number" && { mosqueLat: b.mosqueLat }),
    ...(typeof b.mosqueLng === "number" && { mosqueLng: b.mosqueLng }),
    ...(b.quietHours && {
      quietHours: { ...target.quietHours, ...b.quietHours },
    }),
  };

  if (resolved) {
    settingsByAmazonUserId.set(resolved.profile.user_id, next);
    return res.json({ ok: true, user: resolved.profile.user_id, settings: next });
  }

  demoSettings = next;
  return res.json({ ok: true, user: "demo", settings: demoSettings });
});

// ------------------------------
// GEOCODE
// ------------------------------
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

// ------------------------------
// TEST ADHAN (quiet hours)
// ------------------------------
app.post("/api/test-adhan", async (req, res) => {
  const resolved = await tryResolveAmazonUser(req);
  const settings = resolved ? getAmazonUserSettings(resolved.profile.user_id) : demoSettings;

  const now = new Date();
  const inQuiet = isWithinQuietHours(now, settings.quietHours || {});

  if (inQuiet) {
    return res.json({
      success: true,
      played: false,
      reason: "quiet-hours",
      quietHours: settings.quietHours,
      message: "Adhan muted because it is within quiet hours.",
    });
  }

  return res.json({
    success: true,
    played: true,
    reason: "ok",
    quietHours: settings.quietHours,
    message: "Test Adhan triggered (demo)",
  });
});

// ------------------------------
// DUAS
// ------------------------------
app.get("/api/duas/categories", (req, res) => {
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

// ------------------------------
// QURAN (AlQuran Cloud)
// ------------------------------
app.get("/api/quran/surahs", async (req, res) => {
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
    } catch { }

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
      surahAudioUrl: null,
      verses,
    });
  } catch (err) {
    console.error("Error fetching surah detail:", err);
    res.status(500).json({ error: "Internal error fetching surah detail" });
  }
});

// ------------------------------
// MOSQUES
// ------------------------------
app.get("/api/mosques", async (req, res) => {
  const { query = "", city = "", bias = "user", radiusKm = "15", country = "" } = req.query;
  const q = String(query || city || "").trim();
  const radiusMeters = Math.max(1, Number(radiusKm) || 15) * 1000;

  // Use demo settings for bias center (or user settings if token provided)
  const resolved = await tryResolveAmazonUser(req);
  const settings = resolved ? getAmazonUserSettings(resolved.profile.user_id) : demoSettings;

  // Preferred: Google Places
  if (GOOGLE_PLACES_API_KEY) {
    try {
      const region = (settings.country || "US").toLowerCase();
      let url = "";

      if (bias === "user") {
        const coords = resolveCoordinatesFromSettings(settings);
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
    let centerLat, centerLon;

    if (bias === "user") {
      const coords = resolveCoordinatesFromSettings(settings);
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

app.get("/api/mosques/:placeId/times", async (req, res) => {
  const { placeId } = req.params;
  const { date } = req.query;

  const dateISO =
    typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)
      ? date
      : new Date().toISOString().slice(0, 10);

  const resolved = await tryResolveAmazonUser(req);
  const settings = resolved ? getAmazonUserSettings(resolved.profile.user_id) : demoSettings;

  // OSM placeId
  if (String(placeId).startsWith("osm:")) {
    try {
      const details = await overpassLookupByPlaceId(placeId);
      if (!details) return res.status(404).json({ error: "Mosque not found" });

      const dayResult = buildPrayerTimesForDate({ dateISO, settings });
      return res.json({ date: dateISO, mosque: details, prayers: dayResult.prayers, source: "calculation" });
    } catch (err) {
      console.error("[mosque times] OSM error:", err);
      return res.status(502).json({ error: "Failed to compute mosque times" });
    }
  }

  // Google details
  if (!GOOGLE_PLACES_API_KEY) {
    return res.status(500).json({
      error: "Mosque times by Google Place ID require GOOGLE_PLACES_API_KEY. Configure it or use OSM results.",
    });
  }

  try {
    const detailsUrl =
      `https://maps.googleapis.com/maps/api/place/details/json` +
      `?place_id=${encodeURIComponent(placeId)}` +
      "&fields=name,formatted_address,geometry" +
      `&key=${GOOGLE_PLACES_API_KEY}`;

    const detailsResp = await fetch(detailsUrl);
    if (!detailsResp.ok) return res.status(502).json({ error: "Failed to fetch mosque details" });

    const detailsData = await detailsResp.json();
    const result = detailsData.result;

    if (!result?.geometry?.location) return res.status(404).json({ error: "Mosque location not found" });

    const dayResult = buildPrayerTimesForDate({ dateISO, settings });

    return res.json({
      date: dateISO,
      mosque: {
        placeId,
        name: result.name,
        address: result.formatted_address,
        location: { lat: result.geometry.location.lat, lng: result.geometry.location.lng },
        source: "google",
      },
      prayers: dayResult.prayers,
      source: "calculation",
    });
  } catch (err) {
    console.error("[mosque times] error:", err);
    return res.status(502).json({ error: "Failed to compute mosque times" });
  }
});

// ------------------------------
// PRAYER TIMES
// ------------------------------
app.get("/api/prayer-times/today", async (req, res) => {
  try {
    const dateISO =
      typeof req.query.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date)
        ? req.query.date
        : new Date().toISOString().slice(0, 10);

    const resolved = await tryResolveAmazonUser(req);
    const settings = resolved ? getAmazonUserSettings(resolved.profile.user_id) : demoSettings;

    const normalizedShia = req.query.shia === "true" || req.query.shia === true || settings.shia === true;

    const hasSelectedMosqueCoords =
      !!settings.mosqueId &&
      typeof settings.mosqueLat === "number" &&
      typeof settings.mosqueLng === "number";

    const methodNum = aladhanMethodNumber(req.query.method ?? settings.calculationMethod, PRAYER_METHOD_DEFAULT);

    if (hasSelectedMosqueCoords) {
      const prayers = await aladhanTimingsByCoords(settings.mosqueLat, settings.mosqueLng, dateISO, methodNum);

      const tomorrowISO = addDaysISO(dateISO, 1);
      const tomorrowPrayers = await aladhanTimingsByCoords(settings.mosqueLat, settings.mosqueLng, tomorrowISO, methodNum);

      if (prayers) {
        return res.json({
          date: dateISO,
          location: { city: settings.city, country: settings.country, timezone: settings.timezone },
          source: "mosque",
          mosque: {
            id: settings.mosqueId,
            name: settings.mosqueName,
            address: settings.mosqueAddress,
            location: { lat: settings.mosqueLat, lng: settings.mosqueLng },
          },
          settingsUsed: {
            method: settings.calculationMethod,
            madhhab: settings.madhhab,
            shia: !!normalizedShia,
            highLatitudeMethod: settings.highLatitudeMethod,
          },
          prayers,
          nextFajr: tomorrowPrayers?.fajr ?? null,
          nextFajrDate: tomorrowISO,
          meta: { provider: "aladhan", method: methodNum },
        });
      }
    }

    // fallback calc mode
    const result = buildPrayerTimesForDate({
      dateISO,
      settings,
      overrides: {
        city: req.query.city,
        country: req.query.country,
        method: req.query.method,
        madhhab: req.query.madhhab,
        shia: normalizedShia,
        highLatitudeMethod: req.query.highLatitudeMethod,
      },
    });

    return res.json(result);
  } catch (err) {
    console.error("Error in /api/prayer-times/today:", err);
    return res.status(500).json({ error: "Failed to compute today's prayer times." });
  }
});

app.get("/api/prayer-times/month", async (req, res) => {
  const resolved = await tryResolveAmazonUser(req);
  const settings = resolved ? getAmazonUserSettings(resolved.profile.user_id) : demoSettings;

  const monthParam = req.query.month;
  let year, month;

  if (typeof monthParam === "string" && /^\d{4}-\d{2}$/.test(monthParam)) {
    const parts = monthParam.split("-");
    year = parseInt(parts[0], 10);
    month = parseInt(parts[1], 10);
  } else {
    const now = new Date();
    year = now.getFullYear();
    month = now.getMonth() + 1;
  }

  const monthStr = String(month).padStart(2, "0");
  const daysInMonth = new Date(year, month, 0).getDate();

  const days = [];
  for (let day = 1; day <= daysInMonth; day++) {
    const dayStr = String(day).padStart(2, "0");
    const dateISO = `${year}-${monthStr}-${dayStr}`;
    days.push(buildPrayerTimesForDate({ dateISO, settings }));
  }

  res.json({
    location: { city: settings.city, country: settings.country },
    month: `${year}-${monthStr}`,
    days,
  });
});

// ------------------------------
// QIBLAH
// ------------------------------
const KAABA_COORDS = { lat: 21.4225, lon: 39.8262 };

function toRadians(deg) { return (deg * Math.PI) / 180; }
function toDegrees(rad) { let deg = (rad * 180) / Math.PI; if (deg < 0) deg += 360; return deg; }

function calculateQiblahBearing(lat, lon) {
  const lat1 = toRadians(lat);
  const lon1 = toRadians(lon);
  const lat2 = toRadians(KAABA_COORDS.lat);
  const lon2 = toRadians(KAABA_COORDS.lon);
  const dLon = lon2 - lon1;

  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return toDegrees(Math.atan2(y, x));
}

function bearingToDirection(bearing) {
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW", "N"];
  const idx = Math.round(bearing / 45);
  return dirs[idx];
}

app.get("/api/qiblah", (req, res) => {
  const lat = parseFloat(req.query.lat);
  const lng = parseFloat(req.query.lng);

  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    return res.status(400).json({
      error: "Please provide lat and lng as query parameters, e.g. /api/qiblah?lat=41.8781&lng=-87.6298",
    });
  }

  const bearing = calculateQiblahBearing(lat, lng);
  const direction = bearingToDirection(bearing);

  res.json({
    location: { lat, lon: lng },
    kaaba: { lat: KAABA_COORDS.lat, lon: KAABA_COORDS.lon },
    bearing,
    direction,
    source: "formula",
    message: `Face ${Math.round(bearing)}° from true north (${direction}).`,
  });
});

// ------------------------------
// START SERVER
// ------------------------------
const server = app.listen(PORT, () => console.log(`Backend listening on ${PORT}`));
server.on("error", (err) => console.error("[server error]", err));
