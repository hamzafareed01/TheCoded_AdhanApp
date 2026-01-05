// backend/index.js
require('dotenv').config();
const express = require("express");
const cors = require("cors");
const adhan = require("adhan");
const path = require("path");
const GOOGLE_PLACES_NEARBY_URL = "https://places.googleapis.com/v1/places:searchNearby";


// Node 18+ has global fetch built in (Node 22 in your case).
// If you ever run on Node < 18, install node-fetch and require it here.
const QURAN_API_BASE = "https://api.alquran.cloud/v1";
const ALADHAN_BASE = "https://api.aladhan.com/v1";
// ------------------------------
// Helpers for AlAdhan timings
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

// AlAdhan may return "05:12 (CST)" — keep only "05:12"
function stripAladhanTime(v) {
  return String(v ?? "").trim().split(" ")[0];
}

// Map your stored method ("isna"/"karachi") to AlAdhan method numbers.
// (You only care about US + PK for now)
function aladhanMethodNumber(methodLike, fallback) {
  // numeric string like "2"
  if (typeof methodLike === "string" && /^\d+$/.test(methodLike.trim())) {
    return Number(methodLike.trim());
  }
  if (typeof methodLike === "number" && Number.isFinite(methodLike)) {
    return methodLike;
  }

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


const duas = require("./data/duas.json");

const app = express();
const PORT = process.env.PORT || 4000;

const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY;
const GOOGLE_PLACES_SEARCH_URL =
  'https://places.googleapis.com/v1/places:searchText';
const PRAYER_METHOD_DEFAULT = Number(process.env.PRAYER_METHOD_DEFAULT || 2);
const OPENCAGE_API_KEY = process.env.OPENCAGE_API_KEY;
console.log('OPENCAGE_API_KEY present?', !!OPENCAGE_API_KEY);

app.use(cors());
app.use(express.json());

// Serve audio files (Adhan, Duas, etc.)
app.use("/audio", express.static(path.join(__dirname, "audio")));

// --------------------------------------
// MOCK DATA FOR MVP (no database yet)
// --------------------------------------

// simple in-memory "user"
const MOCK_USER_ID = "demo-user-1";

// --- Mock users for login (MVP: no real DB, no JWT) ---
const mockUsers = [
  {
    id: MOCK_USER_ID,
    email: "demo@adhan.app",
    password: "password123", // DEMO ONLY
    name: "Demo User",
  },
];

// Single in-memory user (for now)
let userSettings = {
  userId: 'demo-user-1',

  // fiqh + calc preferences
  language: 'en',
  madhhab: 'hanafi',            // 'hanafi' or 'shafi'
  shia: false,
  calculationMethod: 'isna',    // 'isna' (US) or 'karachi' (PK) etc.
  highLatitudeMethod: 'middle_of_the_night',

  // location
  country: 'US',                // 'US' or 'PK'
  city: 'Chicago',
  timezone: 'America/Chicago',  // or 'Asia/Karachi'
  latitude: 41.8781,            // Chicago by default
  longitude: -87.6298,

  // selected mosque (from Google Places)
  mosqueId: null,
  mosqueName: null,
  mosqueAddress: null,
  mosqueLat: null,
  mosqueLng: null,

  // quiet hours
  quietHours: {
    enabled: true,
    from: '22:00',
    to: '07:00',
    muteFajr: true,
  },
};

// --------------------------------------
// Minimal real coordinates for cities we support
// (no fake timetables – just real lat/lon + timezone)
// --------------------------------------
const KNOWN_CITY_COORDS = {
  "us:chicago": {
    lat: 41.8781,
    lon: -87.6298,
    timezone: "America/Chicago",
    city: "Chicago",
    country: "US",
  },
  "pk:karachi": {
    lat: 24.8607,
    lon: 67.0011,
    timezone: "Asia/Karachi",
    city: "Karachi",
    country: "PK",
  },
  "pk:lahore": {
    lat: 31.5204,
    lon: 74.3587,
    timezone: "Asia/Karachi",
    city: "Lahore",
    country: "PK",
  },
  "pk:islamabad": {
    lat: 33.6844,
    lon: 73.0479,
    timezone: "Asia/Karachi",
    city: "Islamabad",
    country: "PK",
  },
};

function resolveCoordinatesFromSettings({ city, country }) {
  // 1) If we already have explicit coordinates (e.g. from a mosque),
  //    use those and respect the stored timezone.
  if (
    typeof userSettings.latitude === "number" &&
    typeof userSettings.longitude === "number"
  ) {
    return {
      lat: userSettings.latitude,
      lon: userSettings.longitude,
      timezone: userSettings.timezone || "America/Chicago",
      city: userSettings.city || "Chicago",
      country: userSettings.country || "US",
    };
  }

  const normalizedCity = (city || userSettings.city || "")
    .trim()
    .toLowerCase();
  const normalizedCountry = (country || userSettings.country || "US")
    .trim()
    .toLowerCase();

  const key = `${normalizedCountry}:${normalizedCity}`;
  const entry = KNOWN_CITY_COORDS[key];

  if (entry) {
    return entry;
  }

  // Fallback: Pakistan but unknown city → Karachi
  if (normalizedCountry === "pk") {
    return KNOWN_CITY_COORDS["pk:karachi"];
  }

  // Default → Chicago, US
  return KNOWN_CITY_COORDS["us:chicago"];
}


// tiny mock mosque list (legacy – UI will use Google-based routes instead)
const mockMosques = [
  {
    id: "mosque-1",
    name: "Downtown Islamic Center",
    city: "Chicago, IL",
    madhhab: "hanafi",
    hasRamadanTimetable: true,
  },
  {
    id: "mosque-2",
    name: "Muslim Community Center",
    city: "Chicago, IL",
    madhhab: "hanafi",
    hasRamadanTimetable: false,
  },
  {
    id: "mosque-3",
    name: "Masjid Al-Farooq",
    city: "New York, NY",
    madhhab: "shafi",
    hasRamadanTimetable: true,
  },
];

// mock mosque-specific timetables (legacy / fallback)
const mockMosqueTimetables = [];

// --------------------------------------
// BASIC LOCATION → COORDINATES MAPPING (DEMO)
// --------------------------------------

const CITY_COORDS = {
  "60607": { lat: 41.8781, lon: -87.6298 },
  chicago: { lat: 41.8781, lon: -87.6298 },
};

function getCoordinatesForLocation(city, country) {
  if (!city) return CITY_COORDS["chicago"];

  const key = String(city).toLowerCase().trim();
  if (CITY_COORDS[key]) return CITY_COORDS[key];

  if (CITY_COORDS[String(city)]) return CITY_COORDS[String(city)];

  return CITY_COORDS["chicago"];
}

function normaliseTimeZone(tz) {
  if (!tz) return "America/Chicago";
  const lower = String(tz).toLowerCase();
  if (lower === "america/chicago") return "America/Chicago";
  return tz;
}

function formatTimeWithTz(dateObj, timezone) {
  const tz = normaliseTimeZone(timezone);
  return dateObj.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: tz,
  });
}

// --------------------------------------
// Qiblah calculation helpers
// --------------------------------------
const KAABA_COORDS = {
  lat: 21.4225,
  lon: 39.8262,
};

function toRadians(deg) {
  return (deg * Math.PI) / 180;
}

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

  const theta = Math.atan2(y, x);
  return toDegrees(theta); // 0–360
}

function bearingToDirection(bearing) {
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW", "N"];
  const idx = Math.round(bearing / 45);
  return dirs[idx];
}

// helper: find mosque timings for given mosque + date (mock table)
function findMosqueTimes(mosqueId, date) {
  return null;
}

// --------------------------------------
// Build prayer times with adhan-js
// --------------------------------------
function getCalculationParams(methodKey) {
  // You can expand this later (makkah, egypt, etc.)
  switch ((methodKey || '').toLowerCase()) {
    case 'karachi': // Pakistan
      return adhan.CalculationMethod.Karachi();
    case 'isna':    // North America
    default:
      return adhan.CalculationMethod.NorthAmerica();
  }
}

// --------------------------------------
// Build prayer times for a single day
// --------------------------------------
function buildPrayerTimesForDate({
  date,
  city,
  country,
  method,
  madhhab,
  shia,
  mosqueId, // kept for future but not used for any fake timetables
  timezone,
}) {
  // 1) Resolve coordinates (US or Pakistan, or mosque coordinates)
  const {
    lat,
    lon,
    timezone: resolvedTz,
    city: resolvedCity,
    country: resolvedCountry,
  } = resolveCoordinatesFromSettings({ city, country });

  const coordinates = new adhan.Coordinates(lat, lon);

  // 2) Calculation method
  const methodToUse = method || userSettings.calculationMethod || "isna";

  let params;
  switch (methodToUse) {
    case "makkah":
      params = adhan.CalculationMethod.Makkah();
      break;
    case "egypt":
      params = adhan.CalculationMethod.Egyptian();
      break;
    case "karachi":
      params = adhan.CalculationMethod.Karachi();
      break;
    case "mwl":
      params = adhan.CalculationMethod.MuslimWorldLeague();
      break;
    case "isna":
    default:
      params = adhan.CalculationMethod.NorthAmerica();
      break;
  }

  // 3) Madhhab
  const madhhabToUse = madhhab || userSettings.madhhab || "shafi";
  params.madhab =
    madhhabToUse === "hanafi"
      ? adhan.Madhab.Hanafi
      : adhan.Madhab.Shafi;

  // 4) High latitude rule based on user setting
  const highLatSetting =
    userSettings.highLatitudeMethod || "automatic";

  switch (highLatSetting) {
    case "middle_of_the_night":
      params.highLatitudeRule = adhan.HighLatitudeRule.MiddleOfTheNight;
      break;
    case "one_seventh":
      params.highLatitudeRule = adhan.HighLatitudeRule.SeventhOfTheNight;
      break;
    case "angle_based":
      params.highLatitudeRule = adhan.HighLatitudeRule.TwilightAngle;
      break;
    case "automatic":
    default:
      // keep library default
      break;
  }

  // 5) Create a Date for that calendar day (server timezone is OK;
  //    the adhan library mainly needs the calendar date).
  const dateForCalc = new Date(`${date}T12:00:00`);

  const prayerTimes = new adhan.PrayerTimes(
    coordinates,
    dateForCalc,
    params
  );

  function formatTime(d) {
    return d.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  }

  const prayers = {
    fajr: formatTime(prayerTimes.fajr),
    sunrise: formatTime(prayerTimes.sunrise),
    dhuhr: formatTime(prayerTimes.dhuhr),
    asr: formatTime(prayerTimes.asr),
    maghrib: formatTime(prayerTimes.maghrib),
    isha: formatTime(prayerTimes.isha),
  };

  return {
    date,
    location: {
      city: resolvedCity,
      country: resolvedCountry,
    },
    // 🔴 Important: NO fake mosque timetables. Everything is calculated.
    source: "calculation",
    mosque: null,
    settingsUsed: {
      method: methodToUse,
      madhhab: madhhabToUse,
      shia: !!shia,
      highLatitudeMethod: highLatSetting,
    },
    prayers,
  };
}


// --------------------------------------
// Quiet hours helper
// --------------------------------------
function isWithinQuietHours(now, quietHours) {
  if (!quietHours || !quietHours.enabled) return false;

  const { from, to } = quietHours;
  if (!from || !to) return false;

  const [fromH, fromM] = from.split(":").map(Number);
  const [toH, toM] = to.split(":").map(Number);

  if (
    Number.isNaN(fromH) ||
    Number.isNaN(fromM) ||
    Number.isNaN(toH) ||
    Number.isNaN(toM)
  ) {
    return false;
  }

  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const fromMinutes = fromH * 60 + fromM;
  const toMinutes = toH * 60 + toM;

  if (fromMinutes === toMinutes) {
    return true;
  }

  if (fromMinutes < toMinutes) {
    return currentMinutes >= fromMinutes && currentMinutes < toMinutes;
  }

  return currentMinutes >= fromMinutes || currentMinutes < toMinutes;
}

// --------------------------------------
// BASIC ROUTES
// --------------------------------------
app.get("/", (req, res) => {
  res.send("Adhan backend is running. Try /api/health");
});

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", message: "Adhan backend running" });
});

// ---------------------------------------------------------------------------
// Geocoding: turn "city + country" into lat/lng + timezone (US / PK)
// ---------------------------------------------------------------------------
// -------------------------------------------------------------
// Geocoding: look up lat/lng + timezone for a city in US/PK
// -------------------------------------------------------------
app.get("/api/geocode", async (req, res) => {
  const { city, country } = req.query; // country: "US" or "PK"

  if (!city || !country) {
    return res.status(400).json({ error: "city and country are required" });
  }

  if (!OPENCAGE_API_KEY) {
    return res.status(500).json({
      error:
        "Geocoding is not configured on the server (missing OPENCAGE_API_KEY).",
    });
  }

  try {
    const q = `${city}, ${country}`;
    const params = new URLSearchParams({
      q,
      key: OPENCAGE_API_KEY,
      limit: "1",
      no_annotations: "0", // we want timezone info
      language: "en",
      countrycode: country.toLowerCase(), // restrict to US or PK
    });

    const response = await fetch(
      `https://api.opencagedata.com/geocode/v1/json?${params.toString()}`
    );

    if (!response.ok) {
      throw new Error(`OpenCage HTTP ${response.status}`);
    }

    const data = await response.json();

    if (!data.results || data.results.length === 0) {
      return res.status(404).json({ error: "No matching location found." });
    }

    // OpenCage response shape: geometry.lat / geometry.lng / annotations.timezone.name :contentReference[oaicite:1]{index=1}
    const result = data.results[0];
    const { lat, lng } = result.geometry;
    const timezone =
      result.annotations &&
        result.annotations.timezone &&
        result.annotations.timezone.name
        ? result.annotations.timezone.name
        : null;

    return res.json({
      lat,
      lng,
      timezone,
    });
  } catch (err) {
    console.error("Geocoding error:", err);
    return res.status(500).json({
      error: "Geocoding failed. Please try again later.",
    });
  }
});



app.post("/api/test-adhan", (req, res) => {
  const { prayerCode } = req.body || {};
  const now = new Date();
  const quiet = userSettings.quietHours || {};

  const inQuiet = isWithinQuietHours(now, quiet);

  if (inQuiet) {
    console.log(
      "Test Adhan request blocked due to quiet hours:",
      quiet.from,
      "–",
      quiet.to
    );

    return res.json({
      success: true,
      played: false,
      reason: "quiet-hours",
      quietHours: quiet,
      message: "Adhan muted because it is within quiet hours.",
    });
  }

  console.log("Test Adhan triggered for demo (not in quiet hours)");
  return res.json({
    success: true,
    played: true,
    reason: "ok",
    quietHours: quiet,
    message: "Test Adhan triggered (demo)",
  });
});

// --------------------------------------
// DUA (from data/duas.json)
// --------------------------------------
app.get("/api/duas", (req, res) => {
  const { category = "", search = "" } = req.query;
  const cat = String(category).toLowerCase();
  const q = String(search).toLowerCase();

  const results = duas.filter((d) => {
    const matchCategory = !cat || d.category.toLowerCase() === cat;
    const matchSearch =
      !q ||
      d.title.toLowerCase().includes(q) ||
      (d.textTranslation &&
        d.textTranslation.toLowerCase().includes(q));
    return matchCategory && matchSearch;
  });

  res.json({
    count: results.length,
    duas: results,
  });
});

app.get("/api/duas/:id", (req, res) => {
  const dua = duas.find((d) => d.id === req.params.id);
  if (!dua) {
    return res.status(404).json({ error: "Dua not found" });
  }
  res.json(dua);
});

// --------------------------------------
// QUR'AN (real API via AlQuran Cloud)
// --------------------------------------
app.get("/api/quran/surahs", async (req, res) => {
  try {
    const apiRes = await fetch(`${QURAN_API_BASE}/surah`);
    if (!apiRes.ok) {
      return res
        .status(502)
        .json({ error: "Failed to fetch surahs from Qur'an API" });
    }

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

// --------------------------------------
// QUR'AN (real API via AlQuran Cloud)
// --------------------------------------
app.get("/api/quran/surahs/:id", async (req, res) => {
  const surahId = req.params.id;

  try {
    // 1) Arabic + audio (Mishary Al-Afasy)
    // 2) English translation (Sahih International)
    // 3) English transliteration (en.transliteration) – optional
    const [audioRes, translationRes] = await Promise.all([
      fetch(`${QURAN_API_BASE}/surah/${surahId}/ar.alafasy`),
      fetch(`${QURAN_API_BASE}/surah/${surahId}/en.sahih`),
    ]);

    if (!audioRes.ok) {
      return res
        .status(502)
        .json({ error: "Failed to fetch surah audio from Qur'an API" });
    }
    if (!translationRes.ok) {
      return res
        .status(502)
        .json({ error: "Failed to fetch surah translation from Qur'an API" });
    }

    const audioJson = await audioRes.json();
    const translationJson = await translationRes.json();

    // Try to fetch transliteration, but don't break if it fails
    let transliterationData = null;
    try {
      const translitRes = await fetch(
        `${QURAN_API_BASE}/surah/${surahId}/en.transliteration`
      );
      if (translitRes.ok) {
        const translitJson = await translitRes.json();
        transliterationData = translitJson.data;
      } else {
        console.warn(
          "Transliteration request failed with status:",
          translitRes.status
        );
      }
    } catch (e) {
      console.warn("Error fetching transliteration:", e);
    }

    const s = audioJson.data; // Arabic + audio
    const t = translationJson.data; // English translation
    const tr = transliterationData; // English transliteration (may be null)

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

    const result = {
      id: s.number,
      number: s.number,
      nameArabic: s.name,
      nameEnglish: s.englishName,
      englishNameTranslation: s.englishNameTranslation,
      ayahCount: s.numberOfAyahs,
      revelationType: s.revelationType,
      surahAudioUrl: null, // we’re doing per-ayah audio instead
      verses,
    };

    res.json(result);
  } catch (err) {
    console.error("Error fetching surah detail:", err);
    res.status(500).json({ error: "Internal error fetching surah detail" });
  }
});


// --------------------------------------
// INTEGRATIONS (Alexa / Google / Apple)
// --------------------------------------
let integrationStatus = {
  userId: MOCK_USER_ID,
  alexa: {
    connected: false,
    linkedAt: null,
    displayName: null,
    accountId: null,
  },
  google: {
    connected: false,
    linkedAt: null,
  },
  apple: {
    connected: false,
    linkedAt: null,
  },
};

app.get("/api/integrations", (req, res) => {
  res.json(integrationStatus);
});

app.post("/api/integrations/alexa/mock-link", (req, res) => {
  const now = new Date().toISOString();

  integrationStatus = {
    ...integrationStatus,
    alexa: {
      connected: true,
      linkedAt: now,
      displayName: "demo-user@amazon.com",
      accountId: "amazon-demo-account-123",
    },
  };

  console.log("Alexa mock-link completed:", integrationStatus.alexa);
  res.json({ success: true, alexa: integrationStatus.alexa });
});

// Real-ish login endpoint for Alexa integration (Phase 0)
app.post("/api/integrations/alexa/login", (req, res) => {
  const { accessToken, profile } = req.body || {};

  if (!accessToken) {
    return res.status(400).json({ error: "Missing accessToken" });
  }

  const now = new Date().toISOString();

  const customerName =
    profile?.name || profile?.PrimaryEmail || "Amazon account";
  const customerId = profile?.CustomerId || null;
  const primaryEmail = profile?.PrimaryEmail || null;

  integrationStatus = {
    ...integrationStatus,
    alexa: {
      connected: true,
      linkedAt: now,
      displayName: primaryEmail || customerName,
      accountId: customerId,
    },
  };

  console.log("Alexa linked via Login with Amazon:", integrationStatus.alexa);

  return res.json({
    success: true,
    alexa: integrationStatus.alexa,
  });
});

app.post("/api/integrations/alexa/disconnect", (req, res) => {
  integrationStatus = {
    ...integrationStatus,
    alexa: {
      connected: false,
      linkedAt: null,
      displayName: null,
      accountId: null,
    },
  };

  console.log("Alexa disconnected");
  res.json({ success: true, alexa: integrationStatus.alexa });
});

// --------------------------------------
// AUTH (MVP – simple fake login)
// --------------------------------------
app.post("/api/auth/login", (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res
      .status(400)
      .json({ error: "Email and password are required" });
  }

  const user = mockUsers.find((u) => u.email === email);
  if (!user || user.password !== password) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  userSettings.userId = user.id;

  res.json({
    userId: user.id,
    email: user.email,
    name: user.name,
  });
});

// --------------------------------------
// PRAYER TIMES
// --------------------------------------
app.get("/api/prayer-times/today", async (req, res) => {
  try {
    const isoDate =
      typeof req.query.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date)
        ? req.query.date
        : new Date().toISOString().slice(0, 10);

    const normalizedShia =
      req.query.shia === "true" || req.query.shia === true || userSettings.shia === true;

    // If a mosque is selected AND has coords, return mosque-based timings (Naperville etc.)
    const hasSelectedMosqueCoords =
      !!userSettings.mosqueId &&
      typeof userSettings.mosqueLat === "number" &&
      typeof userSettings.mosqueLng === "number";

    const methodNum = aladhanMethodNumber(
      req.query.method ?? userSettings.calculationMethod,
      PRAYER_METHOD_DEFAULT
    );

    // --------------------------
    // 1) MOSQUE MODE (SYNC DASHBOARD TO SELECTED MOSQUE)
    // --------------------------
    if (hasSelectedMosqueCoords) {
      const prayers = await aladhanTimingsByCoords(
        userSettings.mosqueLat,
        userSettings.mosqueLng,
        isoDate,
        methodNum
      );

      // tomorrow fajr used by dashboard for "after isha" next prayer display
      const tomorrowISO = addDaysISO(isoDate, 1);
      const tomorrowPrayers = await aladhanTimingsByCoords(
        userSettings.mosqueLat,
        userSettings.mosqueLng,
        tomorrowISO,
        methodNum
      );

      if (prayers) {
        return res.json({
          date: isoDate,
          location: {
            city: userSettings.city,
            country: userSettings.country,
            timezone: userSettings.timezone,
          },
          source: "mosque",
          mosque: {
            id: userSettings.mosqueId,
            name: userSettings.mosqueName,
            address: userSettings.mosqueAddress,
            location: { lat: userSettings.mosqueLat, lng: userSettings.mosqueLng },
          },
          settingsUsed: {
            method: userSettings.calculationMethod,
            madhhab: userSettings.madhhab,
            shia: !!normalizedShia,
            highLatitudeMethod: userSettings.highLatitudeMethod,
          },
          prayers,
          nextFajr: tomorrowPrayers?.fajr ?? null,
          nextFajrDate: tomorrowISO,
          meta: {
            provider: "aladhan",
            method: methodNum,
          },
        });
      }

      console.warn("AlAdhan returned no timings; falling back to calculation.");
    }

    // --------------------------
    // 2) FALLBACK MODE (CITY/CALCULATION)
    // --------------------------
    const {
      city = userSettings.city,
      country = userSettings.country,
      method = userSettings.calculationMethod,
      madhhab = userSettings.madhhab,
      timezone = userSettings.timezone,
    } = req.query;

    const result = buildPrayerTimesForDate({
      date: isoDate,
      city,
      country,
      method,
      madhhab,
      shia: normalizedShia,
      mosqueId: req.query.mosqueId,
      timezone,
    });

    return res.json(result);
  } catch (err) {
    console.error("Error in /api/prayer-times/today:", err);
    return res.status(500).json({ error: "Failed to compute today's prayer times." });
  }
});

app.get("/api/prayer-times/month", (req, res) => {
  const {
    city = userSettings.city,
    country = userSettings.country,
    method = userSettings.calculationMethod,
    madhhab = userSettings.madhhab,
    shia = userSettings.shia,
    mosqueId: queryMosqueId,
    month: monthParam,
    timezone = userSettings.timezone,
  } = req.query;

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

  const normalizedShia = shia === "true" || shia === true;
  const monthStr = String(month).padStart(2, "0");
  const daysInMonth = new Date(year, month, 0).getDate();

  const days = [];
  for (let day = 1; day <= daysInMonth; day++) {
    const dayStr = String(day).padStart(2, "0");
    const dateStr = `${year}-${monthStr}-${dayStr}`;

    const dayResult = buildPrayerTimesForDate({
      date: dateStr,
      city,
      country,
      method,
      madhhab,
      shia: normalizedShia,
      mosqueId: queryMosqueId,
      timezone,
    });

    days.push(dayResult);
  }

  res.json({
    location: { city, country },
    month: `${year}-${monthStr}`,
    days,
  });
});

// --------------------------------------
// MOSQUE SEARCH – legacy mock route
// --------------------------------------
// app.get("/api/mosques", (req, res) => {
//   const { query = "", city = "" } = req.query;
//   const q = query.toLowerCase();
//   const c = city.toLowerCase();

//   const results = mockMosques.filter((m) => {
//     const matchQuery =
//       !q ||
//       m.name.toLowerCase().includes(q) ||
//       m.city.toLowerCase().includes(q);
//     const matchCity = !c || m.city.toLowerCase().includes(c);
//     return matchQuery && matchCity;
//   });

//   res.json({
//     count: results.length,
//     mosques: results,
//   });
// });

// ---------------------------------------------------------------------------
// Mosque search: Google Places proxy
// ---------------------------------------------------------------------------
// /api/mosques/search?q=Chicago
app.get('/api/mosques/search', async (req, res) => {
  try {
    const { q, country, bias, lat, lng, radius } = req.query;

    if (!q || typeof q !== 'string') {
      return res.status(400).json({ error: 'Missing q query param' });
    }
    if (!GOOGLE_PLACES_API_KEY) {
      return res.status(500).json({ error: 'Google Places API key not configured' });
    }

    // Only US + PK for now (your requirement)
    const c = String(country || userSettings.country || 'US').toUpperCase();
    const region = c === 'PK' ? 'pk' : 'us';

    const isUserBias = String(bias || '').toLowerCase() === 'user';

    let url = '';
    if (isUserBias) {
      if (typeof lat !== 'string' || typeof lng !== 'string') {
        return res.status(400).json({ error: 'bias=user requires lat and lng' });
      }

      const r = Number(radius || 25000);

      // Nearby Search: mosques around user onboarding coords
      url =
        `https://maps.googleapis.com/maps/api/place/nearbysearch/json` +
        `?location=${encodeURIComponent(lat)},${encodeURIComponent(lng)}` +
        `&radius=${encodeURIComponent(String(r))}` +
        `&keyword=${encodeURIComponent('mosque')}` +
        `&type=${encodeURIComponent('mosque')}` +
        `&key=${GOOGLE_PLACES_API_KEY}`;
    } else {
      // Text Search: mosques in the user typed area (NO Chicago bias)
      const text = `mosque in ${q}`;
      url =
        `https://maps.googleapis.com/maps/api/place/textsearch/json` +
        `?query=${encodeURIComponent(text)}` +
        `&type=${encodeURIComponent('mosque')}` +
        `&region=${encodeURIComponent(region)}` +
        `&key=${GOOGLE_PLACES_API_KEY}`;
    }

    const resp = await fetch(url);
    if (!resp.ok) {
      console.error('Google Places HTTP error status:', resp.status);
      return res.status(502).json({ error: 'Failed to fetch mosques from Google Places' });
    }

    const data = await resp.json();

    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      console.error('Google Places status:', data.status, data.error_message);
      return res.status(502).json({
        error: 'Unexpected response status from Google Places',
        apiStatus: data.status,
        apiError: data.error_message ?? null,
      });
    }

    const mosques = (data.results || []).map((m) => ({
      placeId: m.place_id,
      name: m.name,
      address: m.vicinity || m.formatted_address,
      location: {
        lat: m.geometry?.location?.lat,
        lng: m.geometry?.location?.lng,
      },
    }));

    res.json({ mosques });
  } catch (err) {
    console.error('Error in /api/mosques/search', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});


// --------------------------------------
// Mosque timetable endpoint – not using any fake data.
// Prayer times are always calculated from real coordinates.
// --------------------------------------
app.get("/api/mosques/:id/timetable", (req, res) => {
  return res.status(501).json({
    error:
      "Mosque-specific timetables are not implemented yet. Prayer times are calculated from your selected city/mosque location.",
  });
});
// --------------------------------------
// MOSQUE TIMINGS – REAL (Google Places + AlAdhan)
// --------------------------------------
app.get("/api/mosques/:placeId/times", async (req, res) => {
  try {
    const { placeId } = req.params;
    const method = Number(req.query.method || PRAYER_METHOD_DEFAULT);

    if (!placeId) {
      return res.status(400).json({ error: "Missing placeId param" });
    }

    if (!GOOGLE_PLACES_API_KEY) {
      console.error("GOOGLE_PLACES_API_KEY is not set");
      return res
        .status(500)
        .json({ error: "Google Places API key not configured on server" });
    }

    // 1) Get mosque details (lat/lng) from Google Places Details
    const detailsUrl =
      "https://maps.googleapis.com/maps/api/place/details/json" +
      `?place_id=${encodeURIComponent(placeId)}` +
      "&fields=name,formatted_address,geometry" +
      `&key=${GOOGLE_PLACES_API_KEY}`;

    const detailsResp = await fetch(detailsUrl);
    if (!detailsResp.ok) {
      return res.status(502).json({ error: "Failed to fetch mosque details" });
    }

    const detailsData = await detailsResp.json();
    const result = detailsData.result;

    if (!result?.geometry?.location) {
      return res.status(404).json({ error: "Mosque location not found" });
    }

    const lat = result.geometry.location.lat;
    const lng = result.geometry.location.lng;

    // 2) Get prayer times for *today* from AlAdhan with lat/lng
    const timingsUrl =
      `${ALADHAN_BASE}/timings?latitude=${lat}` +
      `&longitude=${lng}&method=${method}`;

    const tResp = await fetch(timingsUrl);
    if (!tResp.ok) {
      return res.status(502).json({ error: "Failed to fetch prayer timings" });
    }

    const tData = await tResp.json();
    if (!tData.data) {
      return res.status(500).json({ error: "Unexpected response from AlAdhan" });
    }

    res.json({
      mosque: {
        placeId,
        name: result.name,
        address: result.formatted_address,
        location: { lat, lng },
      },
      timings: tData.data.timings, // Fajr, Dhuhr, Asr, Maghrib, Isha, etc.
      date: tData.data.date,
      meta: tData.data.meta, // includes method, lat, lng, etc.
    });
  } catch (err) {
    console.error("Error in /api/mosques/:placeId/times", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// --------------------------------------
// USER SETTINGS
// --------------------------------------
app.get("/api/user/settings", (req, res) => {
  res.json(userSettings);
});

app.post('/api/user/settings', (req, res) => {
  const {
    language,
    madhhab,
    shia,
    calculationMethod,
    highLatitudeMethod,
    country,
    city,
    timezone,
    latitude,
    longitude,
    mosqueId,
    mosqueName,
    mosqueAddress,
    mosqueLat,
    mosqueLng,
    quietHours,
  } = req.body || {};

  // Merge only fields that are provided
  userSettings = {
    ...userSettings,
    ...(language && { language }),
    ...(madhhab && { madhhab }),
    ...(typeof shia === 'boolean' && { shia }),
    ...(calculationMethod && { calculationMethod }),
    ...(highLatitudeMethod && { highLatitudeMethod }),
    ...(country && { country }),
    ...(city && { city }),
    ...(timezone && { timezone }),
    ...(typeof latitude === 'number' && { latitude }),
    ...(typeof longitude === 'number' && { longitude }),
    ...(mosqueId && { mosqueId }),
    ...(mosqueName && { mosqueName }),
    ...(mosqueAddress && { mosqueAddress }),
    ...(typeof mosqueLat === 'number' && { mosqueLat }),
    ...(typeof mosqueLng === 'number' && { mosqueLng }),
    ...(quietHours && {
      quietHours: {
        ...userSettings.quietHours,
        ...quietHours,
      },
    }),
  };

  res.json({ ok: true, settings: userSettings });
});
// --------------------------------------
// QIBLAH
// --------------------------------------
app.get("/api/qiblah", (req, res) => {
  const { lat, lng } = req.query;

  const latitude = parseFloat(lat);
  const longitude = parseFloat(lng);

  if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
    return res.status(400).json({
      error:
        "Please provide lat and lng as query parameters, e.g. /api/qiblah?lat=41.8781&lng=-87.6298",
    });
  }

  const bearing = calculateQiblahBearing(latitude, longitude);
  const direction = bearingToDirection(bearing);

  res.json({
    location: { lat: latitude, lon: longitude },
    kaaba: { lat: KAABA_COORDS.lat, lon: KAABA_COORDS.lon },
    bearing,
    direction,
    source: "formula",
    message: `Face ${Math.round(bearing)}° from true north (${direction}).`,
  });
});

// --------------------------------------
// START SERVER
// --------------------------------------
app.listen(PORT, () => {
  console.log(`Backend listening on http://localhost:${PORT}`);
});