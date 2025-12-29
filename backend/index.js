require('dotenv').config();

// backend/index.js
const express = require("express");
const cors = require("cors");
const adhan = require("adhan");
require("dotenv").config();
const path = require("path");

// Node 18+ has global fetch built in (Node 22 in your case).
// If you ever run on Node < 18, install node-fetch and require it here.
const QURAN_API_BASE = "https://api.alquran.cloud/v1";
const ALADHAN_BASE = "https://api.aladhan.com/v1";

const duas = require("./data/duas.json");

const app = express();
const PORT = process.env.PORT || 4000;
const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY;
const PRAYER_METHOD_DEFAULT = Number(process.env.PRAYER_METHOD_DEFAULT || 2);

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

// user settings stored in memory (per session)
let userSettings = {
  userId: MOCK_USER_ID,
  language: "en",
  madhhab: "hanafi",
  shia: false,
  calculationMethod: "isna",
  highLatitudeMethod: "automatic",

  country: "US",
  city: "Chicago",
  timezone: "America/Chicago",

  // store coordinates – default to Chicago
  latitude: 41.8781,
  longitude: -87.6298,

  // mosque selection
  mosqueId: "mosque-1",
  mosqueName: null,
  mosqueAddress: null,

  quietHours: {
    enabled: true,
    from: "22:00",
    to: "07:00",
    muteFajr: true,
  },
};


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
const mockMosqueTimetables = [
  {
    mosqueId: "mosque-1",
    date: "2025-12-10",
    fajr: "05:45",
    sunrise: "07:05",
    dhuhr: "12:40",
    asr: "15:55",
    maghrib: "17:10",
    isha: "18:30",
  },
  {
    mosqueId: "mosque-1",
    date: "2025-12-11",
    fajr: "05:46",
    sunrise: "07:06",
    dhuhr: "12:41",
    asr: "15:56",
    maghrib: "17:11",
    isha: "18:31",
  },
  {
    mosqueId: "mosque-2",
    date: "2025-12-10",
    fajr: "05:50",
    sunrise: "07:08",
    dhuhr: "12:42",
    asr: "15:58",
    maghrib: "17:12",
    isha: "18:33",
  },
];

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
  return mockMosqueTimetables.find(
    (row) => row.mosqueId === mosqueId && row.date === date
  );
}

// --------------------------------------
// Build prayer times with adhan-js
// --------------------------------------
function buildPrayerTimesForDate({
  date,
  city,
  country,
  method,
  madhhab,
  shia,
  mosqueId,
  timezone,
}) {
  const lat = userSettings.latitude ?? 41.8781;
  const lon = userSettings.longitude ?? -87.6298;

  const coordinates = new adhan.Coordinates(lat, lon);

  let params;
  switch (method) {
    case "makkah":
      params = adhan.CalculationMethod.Makkah();
      break;
    case "egypt":
      params = adhan.CalculationMethod.Egyptian();
      break;
    case "karachi":
      params = adhan.CalculationMethod.Karachi();
      break;
    case "isna":
    default:
      params = adhan.CalculationMethod.NorthAmerica();
      break;
  }

  params.madhab =
    madhhab === "hanafi" ? adhan.Madhab.Hanafi : adhan.Madhab.Shafi;
  params.highLatitudeRule = adhan.HighLatitudeRule.MiddleOfTheNight;

  const dateObj = new Date(date + "T12:00:00");

  // ✅ Use the helper that formats with a specific IANA timezone
  const tzToUse = timezone || userSettings.timezone || "America/Chicago";
  const formatTime = (d) => formatTimeWithTz(d, tzToUse);

  const prayerTimes = new adhan.PrayerTimes(coordinates, dateObj, params);
  const calculatedTimes = {
    fajr: formatTime(prayerTimes.fajr),
    sunrise: formatTime(prayerTimes.sunrise),
    dhuhr: formatTime(prayerTimes.dhuhr),
    asr: formatTime(prayerTimes.asr),
    maghrib: formatTime(prayerTimes.maghrib),
    isha: formatTime(prayerTimes.isha),
  };

  const effectiveMosqueId = mosqueId || userSettings.mosqueId || null;
  let source = "calculation";
  let prayers = calculatedTimes;
  let mosqueMeta = null;

  if (effectiveMosqueId) {
    const mosqueRow = findMosqueTimes(effectiveMosqueId, date);
    if (mosqueRow) {
      source = "mosque";
      prayers = {
        fajr: mosqueRow.fajr,
        sunrise: mosqueRow.sunrise,
        dhuhr: mosqueRow.dhuhr,
        asr: mosqueRow.asr,
        maghrib: mosqueRow.maghrib,
        isha: mosqueRow.isha,
      };
      mosqueMeta =
        mockMosques.find((m) => m.id === effectiveMosqueId) || null;
    }
  }

  return {
    location: { city, country, latitude: lat, longitude: lon },
    date,
    source,
    mosque: mosqueMeta,
    settingsUsed: {
      method,
      madhhab,
      shia,
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
app.get("/api/prayer-times/today", (req, res) => {
  const {
    city = userSettings.city,
    country = userSettings.country,
    method = userSettings.calculationMethod,
    madhhab = userSettings.madhhab,
    shia = userSettings.shia,
    mosqueId: queryMosqueId,
    date: queryDate,
    timezone = userSettings.timezone,
  } = req.query;

  const today = queryDate || new Date().toISOString().slice(0, 10);
  const normalizedShia = shia === "true" || shia === true;

  const result = buildPrayerTimesForDate({
    date: today,
    city,
    country,
    method,
    madhhab,
    shia: normalizedShia,
    mosqueId: queryMosqueId,
    timezone,
  });

  res.json(result);
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
app.get("/api/mosques", (req, res) => {
  const { query = "", city = "" } = req.query;
  const q = query.toLowerCase();
  const c = city.toLowerCase();

  const results = mockMosques.filter((m) => {
    const matchQuery =
      !q ||
      m.name.toLowerCase().includes(q) ||
      m.city.toLowerCase().includes(q);
    const matchCity = !c || m.city.toLowerCase().includes(c);
    return matchQuery && matchCity;
  });

  res.json({
    count: results.length,
    mosques: results,
  });
});

// --------------------------------------
// MOSQUE SEARCH – REAL (Google Places)
// --------------------------------------
// --------------------------------------
// MOSQUE SEARCH – REAL (Google Places)
// --------------------------------------
app.get('/api/mosques/search', async (req, res) => {
  try {
    const { q, country } = req.query;

    if (!q || typeof q !== 'string') {
      return res
        .status(400)
        .json({ error: 'Missing q query param (city or mosque name)' });
    }

    const query = encodeURIComponent(`mosque ${q}`);

    // Optional: narrow Google results by country/region.
    // We support US + Pakistan explicitly for now; everything else is global.
    let regionParam = '';
    if (typeof country === 'string') {
      const c = country.toLowerCase();
      if (c === 'us' || c === 'usa' || c.includes('united states')) {
        regionParam = '&region=us';
      } else if (c === 'pk' || c === 'pakistan') {
        regionParam = '&region=pk';
      }
    }

    const url =
      `https://maps.googleapis.com/maps/api/place/textsearch/json` +
      `?query=${query}&type=mosque${regionParam}&key=${GOOGLE_PLACES_API_KEY}`;

    const resp = await fetch(url);
    if (!resp.ok) {
      console.error('Google Places HTTP error status:', resp.status);
      return res
        .status(502)
        .json({ error: 'Failed to fetch mosques from Google Places' });
    }

    const data = await resp.json();

    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      console.error(
        'Google Places API status:',
        data.status,
        data.error_message,
      );
      return res.status(502).json({
        error: 'Unexpected response status from Google Places',
        apiStatus: data.status,
        apiError: data.error_message ?? null,
      });
    }

    const mosques = (data.results || []).map((m) => ({
      placeId: m.place_id,
      name: m.name,
      address: m.formatted_address,
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
// MOSQUE TIMETABLE – legacy mock timetable
// --------------------------------------
app.get("/api/mosques/:id/timetable", (req, res) => {
  const mosqueId = req.params.id;
  const date = req.query.date || new Date().toISOString().slice(0, 10);

  const mosque = mockMosques.find((m) => m.id === mosqueId);
  if (!mosque) {
    return res.status(404).json({ error: "Mosque not found" });
  }

  const row = findMosqueTimes(mosqueId, date);
  if (!row) {
    return res.json({
      mosque,
      date,
      hasTimetable: false,
      message: "No timetable row for this date (using calculation fallback).",
    });
  }

  res.json({
    mosque,
    date,
    hasTimetable: true,
    prayers: {
      fajr: row.fajr,
      sunrise: row.sunrise,
      dhuhr: row.dhuhr,
      asr: row.asr,
      maghrib: row.maghrib,
      isha: row.isha,
    },
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

app.post("/api/user/settings", (req, res) => {
  const updates = req.body || {};

  userSettings = {
    ...userSettings,
    ...updates,
    quietHours: {
      ...userSettings.quietHours,
      ...(updates.quietHours || {}),
    },
    mosqueLocation: {
      ...(userSettings.mosqueLocation || {}),
      ...(updates.mosqueLocation || {}),
    },
  };

  console.log("User settings updated:", userSettings);

  res.json({
    success: true,
    settings: userSettings,
  });
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