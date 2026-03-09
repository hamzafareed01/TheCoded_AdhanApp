const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const dotenv = require("dotenv");
const fs = require("fs");
const path = require("path");

dotenv.config();

const { getPool, sql } = require("./db/sql");

const app = express();
app.use(helmet());
app.use(express.json({ limit: "2mb" }));

// -----------------------------
// Helpers
// -----------------------------
const PRAYERS = ["fajr", "dhuhr", "asr", "maghrib", "isha"];
const AMAZON_TOKEN_CACHE_TTL_MS = 5 * 60 * 1000;
const tokenCache = new Map(); // token -> { profile, exp }

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
    return cb(new Error("CORS blocked for origin: " + origin), false);
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
    req.amazonProfile = profile; // { user_id, name, email }
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
        IF NOT EXISTS (SELECT 1 FROM dbo.user_profiles WHERE user_id=@user_id)
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
            WHERE user_id=@user_id AND prayer_name=@prayer_name
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

function parseOffsetsFromBody(body) {
  const src = body?.globalOffsets || body?.offsets || {};
  const out = {};
  for (const prayer of PRAYERS) out[prayer] = Number(src?.[prayer] || 0);
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

  return 2; // safe default: ISNA
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
  return (((radToDeg(theta) % 360) + 360) % 360);
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
  "/api/geocode",
  asyncHandler(async (req, res) => {
    const city = String(req.query.city || "").trim();
    const country = String(req.query.country || "").trim();

    if (!city) {
      return res.status(400).json({ error: "city is required" });
    }

    const apiKey = process.env.OPENCAGE_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "OPENCAGE_API_KEY is not configured" });
    }

    const countryName =
      country === "US" ? "United States" :
      country === "PK" ? "Pakistan" :
      country;

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
        error: "Could not look up coordinates for this city. Please try again.",
      });
    }

    const lat = first.geometry.lat;
    const lng = first.geometry.lng;

    const timezone =
      first?.annotations?.timezone?.name ||
      (country === "PK" ? "Asia/Karachi" : "America/Chicago");

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
    const p = req.amazonProfile;

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
    await ensureUser(pool, profile.user_id);

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
  // Current MVP stores no server-side session/token, so disconnect is a safe no-op.
  // Frontend clears local token and treats the user as disconnected.
  res.json({ ok: true });
});

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
    const userId = await ensureUser(pool, amazonUserId);

    const profileResult = await pool.request()
      .input("user_id", sql.UniqueIdentifier, userId)
      .query(`SELECT * FROM dbo.user_profiles WHERE user_id=@user_id`);

    const prayerResult = await pool.request()
      .input("user_id", sql.UniqueIdentifier, userId)
      .query(`
        SELECT prayer_name, enabled, offset_min, quiet_enabled, quiet_from, quiet_to, adhan_reciter_id, after_type, after_payload_json
        FROM dbo.prayer_configs
        WHERE user_id=@user_id
        ORDER BY prayer_name
      `);

    const p = profileResult.recordset[0] || {};

    res.json({
      userKey: amazonUserId,
      settings: {
        sect: p.sect || "SUNNI",
        shia: p.sect === "SHIA",
        language: p.language || "en",
        madhhab: p.madhhab || "hanafi",
        calculationMethod: p.calculation_method || "isna",
        highLatitudeMethod: p.high_latitude_method || "automatic",
        country: p.country || "US",
        city: p.city || "Chicago",
        timezone: p.timezone || "America/Chicago",
        accountEnabled: !!p.account_enabled,
        globalOffsets: {
          fajr: p.offset_fajr || 0,
          dhuhr: p.offset_dhuhr || 0,
          asr: p.offset_asr || 0,
          maghrib: p.offset_maghrib || 0,
          isha: p.offset_isha || 0,
        },
        prayerConfigs: prayerResult.recordset.map((r) => {
          let afterPayload = null;
          try {
            afterPayload = r.after_payload_json
              ? JSON.parse(r.after_payload_json)
              : null;
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
        }),
      },
    });
  })
);

async function handleSaveUserSettings(req, res) {
  const pool = await getPool();
  const amazonUserId = req.amazonProfile.user_id;
  const userId = await ensureUser(pool, amazonUserId);
  const body = req.body || {};

  const sect = body.sect || (body.shia === true ? "SHIA" : undefined);
  const calc = body.calculationMethod || body.calculation_method;
  const madhhab = body.madhhab;
  const high = body.highLatitudeMethod || body.high_latitude_method;
  const language = body.language;
  const country = body.country;
  const city = body.city;
  const timezone = body.timezone;
  const accountEnabled = body.accountEnabled ?? body.account_enabled;

  const offsets = parseOffsetsFromBody(body);

  const profileReq = pool.request().input("user_id", sql.UniqueIdentifier, userId);

  if (sect !== undefined) {
    profileReq.input("sect", sql.NVarChar(10), String(sect).toUpperCase());
  }
  if (calc !== undefined) {
    profileReq.input("calc", sql.NVarChar(50), String(calc));
  }
  if (madhhab !== undefined) {
    profileReq.input("madhhab", sql.NVarChar(20), String(madhhab));
  }
  if (high !== undefined) {
    profileReq.input("high", sql.NVarChar(30), String(high));
  }
  if (language !== undefined) {
    profileReq.input("language", sql.NVarChar(10), String(language));
  }
  if (country !== undefined) {
    profileReq.input("country", sql.NVarChar(64), String(country));
  }
  if (city !== undefined) {
    profileReq.input("city", sql.NVarChar(128), String(city));
  }
  if (timezone !== undefined) {
    profileReq.input("timezone", sql.NVarChar(64), String(timezone));
  }
  if (accountEnabled !== undefined) {
    profileReq.input("account_enabled", sql.Bit, accountEnabled ? 1 : 0);
  }

  profileReq.input("off_fajr", sql.Int, offsets.fajr);
  profileReq.input("off_dhuhr", sql.Int, offsets.dhuhr);
  profileReq.input("off_asr", sql.Int, offsets.asr);
  profileReq.input("off_maghrib", sql.Int, offsets.maghrib);
  profileReq.input("off_isha", sql.Int, offsets.isha);

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
      account_enabled = COALESCE(@account_enabled, account_enabled),
      offset_fajr = @off_fajr,
      offset_dhuhr = @off_dhuhr,
      offset_asr = @off_asr,
      offset_maghrib = @off_maghrib,
      offset_isha = @off_isha,
      updated_at = SYSUTCDATETIME()
    WHERE user_id=@user_id
  `);

  const quietHours = body.quietHours;
  if (quietHours && typeof quietHours === "object") {
    const quietEnabled = quietHours.enabled ? 1 : 0;
    const quietFrom = quietHours.from || null;
    const quietTo = quietHours.to || null;

    await pool.request()
      .input("user_id", sql.UniqueIdentifier, userId)
      .input("quiet_enabled", sql.Bit, quietEnabled)
      .input("quiet_from", sql.Time, quietFrom)
      .input("quiet_to", sql.Time, quietTo)
      .query(`
        UPDATE dbo.prayer_configs
        SET
          quiet_enabled=@quiet_enabled,
          quiet_from=@quiet_from,
          quiet_to=@quiet_to,
          updated_at=SYSUTCDATETIME()
        WHERE user_id=@user_id
      `);
  }

  const pcs = Array.isArray(body.prayerConfigs) ? body.prayerConfigs : null;
  if (pcs) {
    for (const pc of pcs) {
      const prayerName = String(
        pc.prayerName || pc.prayer_name || ""
      ).toLowerCase();

      if (!PRAYERS.includes(prayerName)) continue;

      const afterType = String(
        pc.afterAdhan?.type || pc.after_type || "none"
      ).toLowerCase();

      const afterPayload =
        pc.afterAdhan?.payload ?? pc.after_payload ?? null;
      const afterPayloadJson = afterPayload
        ? JSON.stringify(afterPayload)
        : null;

      await pool.request()
        .input("user_id", sql.UniqueIdentifier, userId)
        .input("prayer_name", sql.NVarChar(10), prayerName)
        .input("enabled", sql.Bit, pc.enabled === false ? 0 : 1)
        .input("offset_min", sql.Int, Number(pc.offsetMin ?? pc.offset_min ?? 0))
        .input("quiet_enabled", sql.Bit, pc.quietEnabled ? 1 : 0)
        .input("quiet_from", sql.Time, pc.quietFrom || null)
        .input("quiet_to", sql.Time, pc.quietTo || null)
        .input("adhan_reciter_id", sql.NVarChar(64), pc.adhanReciterId || null)
        .input("after_type", sql.NVarChar(16), afterType)
        .input("after_payload_json", sql.NVarChar(sql.MAX), afterPayloadJson)
        .query(`
          UPDATE dbo.prayer_configs
          SET
            enabled=@enabled,
            offset_min=@offset_min,
            quiet_enabled=@quiet_enabled,
            quiet_from=@quiet_from,
            quiet_to=@quiet_to,
            adhan_reciter_id=@adhan_reciter_id,
            after_type=@after_type,
            after_payload_json=@after_payload_json,
            updated_at=SYSUTCDATETIME()
          WHERE user_id=@user_id AND prayer_name=@prayer_name
        `);
    }
  }

  res.json({ ok: true });
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
    const userId = await ensureUser(pool, amazonUserId);

    const profileResult = await pool.request()
      .input("user_id", sql.UniqueIdentifier, userId)
      .query(`SELECT * FROM dbo.user_profiles WHERE user_id=@user_id`);

    const prayerResult = await pool.request()
      .input("user_id", sql.UniqueIdentifier, userId)
      .query(`
        SELECT prayer_name, enabled, offset_min
        FROM dbo.prayer_configs
        WHERE user_id=@user_id
      `);

    const p = profileResult.recordset[0] || {};

    const perPrayerOffset = {};
    const enabledMap = {};
    for (const r of prayerResult.recordset) {
      perPrayerOffset[r.prayer_name] = r.offset_min || 0;
      enabledMap[r.prayer_name] = !!r.enabled;
    }

    const method = mapCalcMethodToAlAdhan(
      p.calculation_method || "isna",
      p.sect || "SUNNI"
    );
    const school = madhhabToSchool(p.madhhab || "hanafi");

    const city = encodeURIComponent(p.city || "Chicago");
    const country = encodeURIComponent(p.country || "US");

    const url = `https://api.aladhan.com/v1/timingsByCity?city=${city}&country=${country}&method=${method}&school=${school}`;
    const resp = await fetch(url);

    if (!resp.ok) {
      return res.status(502).json({ error: "Prayer API upstream failed" });
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
      fajr: p.offset_fajr || 0,
      dhuhr: p.offset_dhuhr || 0,
      asr: p.offset_asr || 0,
      maghrib: p.offset_maghrib || 0,
      isha: p.offset_isha || 0,
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
        city: p.city || "Chicago",
        country: p.country || "US",
        timezone: p.timezone || "America/Chicago",
      },
      method: {
        sect: p.sect || "SUNNI",
        calculationMethod: p.calculation_method || "isna",
        madhhab: p.madhhab || "hanafi",
      },
      enabled: enabledMap,
      prayers24: adjusted24,
      prayers12: adjusted12,
      date: json?.data?.date || null,
    });
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

    const result = await pool.request()
      .input("user_id", sql.UniqueIdentifier, userId)
      .query(`
        SELECT device_id AS id, device_name AS name, platform
        FROM dbo.devices
        WHERE user_id=@user_id AND platform='alexa'
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

    await pool.request()
      .input("user_id", sql.UniqueIdentifier, userId)
      .input("device_id", sql.NVarChar(255), String(id))
      .input("device_name", sql.NVarChar(255), String(name))
      .query(`
        MERGE dbo.devices AS target
        USING (SELECT @user_id AS user_id, 'alexa' AS platform, @device_id AS device_id) AS src
        ON target.user_id=src.user_id AND target.platform=src.platform AND target.device_id=src.device_id
        WHEN MATCHED THEN
          UPDATE SET device_name=@device_name
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

    const result = await pool.request()
      .input("user_id", sql.UniqueIdentifier, userId)
      .query(`
        SELECT id, schedule_type, time_of_day, days_mask, enabled, device_id, payload_json, created_at
        FROM dbo.schedules
        WHERE user_id=@user_id
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
    const deviceId = body.deviceId ? String(body.deviceId) : null;

    if (!/^\d{2}:\d{2}$/.test(timeOfDay)) {
      return res.status(400).json({ error: "timeOfDay must be HH:MM" });
    }

    if (scheduleType !== "tilawat") {
      return res
        .status(400)
        .json({ error: "scheduleType must be 'tilawat' for MVP" });
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

    const result = await pool.request()
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

    await pool.request()
      .input("id", sql.UniqueIdentifier, id)
      .input("user_id", sql.UniqueIdentifier, userId)
      .query(`
        DELETE FROM dbo.schedules
        WHERE id=@id AND user_id=@user_id
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
//push commit comment...remove later
const port = Number(process.env.PORT || 4000);
app.listen(port, () => {
  console.log(`AdhanHome API listening on ${port}`);
});