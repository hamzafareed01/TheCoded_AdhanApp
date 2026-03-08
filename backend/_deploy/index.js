const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const dotenv = require("dotenv");
dotenv.config();
//Test-re-run Comment...remove this line later
// thenejf;maf/;lfas;ldf
const { getPool, sql } = require("./db/sql");

const app = express();
app.use(helmet());
app.use(express.json({ limit: "2mb" }));

// CORS
const originsRaw = process.env.CORS_ORIGINS || "";
const allowedOrigins = originsRaw
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: function (origin, cb) {
      if (!origin) return cb(null, true);
      if (allowedOrigins.length === 0) return cb(null, true);
      if (allowedOrigins.includes(origin)) return cb(null, true);
      return cb(new Error("CORS blocked for origin: " + origin), false);
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    optionsSuccessStatus: 204,
  })
);
app.options("*", cors());

// ---------- Amazon auth (access token -> user profile) ----------
const tokenCache = new Map(); // token -> { profile, exp }
async function fetchAmazonProfile(accessToken) {
  const now = Date.now();
  const cached = tokenCache.get(accessToken);
  if (cached && cached.exp > now) return cached.profile;

  const resp = await fetch("https://api.amazon.com/user/profile", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    const err = new Error(`Amazon profile failed (${resp.status}): ${text}`);
    err.status = 401;
    throw err;
  }
  const profile = await resp.json();
  tokenCache.set(accessToken, { profile, exp: now + 5 * 60 * 1000 });
  return profile;
}

async function requireAmazonAuth(req, res, next) {
  try {
    const auth = req.headers.authorization || "";
    const m = auth.match(/^Bearer\s+(.+)$/i);
    if (!m) return res.status(401).json({ error: "Missing Authorization: Bearer <token>" });
    const token = m[1].trim();
    const profile = await fetchAmazonProfile(token);
    if (!profile?.user_id) return res.status(401).json({ error: "Amazon token invalid" });
    req.amazonProfile = profile; // { user_id, name, email }
    req.amazonToken = token;
    next();
  } catch (e) {
    const status = e.status || 401;
    res.status(status).json({ error: String(e.message || e) });
  }
}

// ---------- DB helpers ----------
const PRAYERS = ["fajr", "dhuhr", "asr", "maghrib", "isha"];

async function ensureUser(pool, amazonUserId) {
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    const u = await new sql.Request(tx)
      .input("amazon_user_id", sql.NVarChar(255), amazonUserId)
      .query(`
        MERGE dbo.users AS target
        USING (SELECT @amazon_user_id AS amazon_user_id) AS src
        ON target.amazon_user_id = src.amazon_user_id
        WHEN NOT MATCHED THEN
          INSERT (amazon_user_id) VALUES (src.amazon_user_id)
        OUTPUT inserted.id AS id;
      `);
    const userId = u.recordset[0].id;

    await new sql.Request(tx)
      .input("user_id", sql.UniqueIdentifier, userId)
      .query(`
        IF NOT EXISTS (SELECT 1 FROM dbo.user_profiles WHERE user_id=@user_id)
          INSERT INTO dbo.user_profiles (user_id) VALUES (@user_id);
      `);

    for (const p of PRAYERS) {
      await new sql.Request(tx)
        .input("user_id", sql.UniqueIdentifier, userId)
        .input("prayer_name", sql.NVarChar(10), p)
        .query(`
          IF NOT EXISTS (SELECT 1 FROM dbo.prayer_configs WHERE user_id=@user_id AND prayer_name=@prayer_name)
            INSERT INTO dbo.prayer_configs (user_id, prayer_name) VALUES (@user_id, @prayer_name);
        `);
    }

    await tx.commit();
    return userId;
  } catch (e) {
    await tx.rollback();
    throw e;
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
  const [hh, mm] = String(hhmm).split(":").map(Number);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return hhmm;
  const suffix = hh >= 12 ? "PM" : "AM";
  const h12 = ((hh + 11) % 12) + 1;
  return `${h12}:${String(mm).padStart(2, "0")} ${suffix}`;
}

function parseOffsetsFromBody(body) {
  const o = body?.globalOffsets || body?.offsets || {};
  const out = {};
  for (const p of PRAYERS) out[p] = Number(o?.[p] || 0);
  return out;
}

function mapCalcMethodToAlAdhan(method, sect) {
  const m = String(method || "").toLowerCase();
  if (sect === "SHIA") return 0; // Shia Ithna-Ashari
  if (m.includes("karachi")) return 1;
  if (m.includes("isna")) return 2;
  if (m.includes("mwl")) return 3;
  if (m.includes("umm")) return 4;
  if (m.includes("egypt")) return 5;
  if (m.includes("tehran")) return 7;
  if (m.includes("makkah")) return 4;
  return 2;
}

function madhhabToSchool(madhhab) {
  return String(madhhab || "").toLowerCase() === "hanafi" ? 1 : 0;
}

// ---------- Routes ----------
app.get("/health", (req, res) => res.json({ ok: true }));
app.get("/api/health", (req, res) => res.json({ ok: true }));

app.get("/api/integrations", requireAmazonAuth, async (req, res) => {
  const p = req.amazonProfile;
  res.json({
    userKey: p.user_id,
    amazon: { connected: true, email: p.email || null },
    alexa: { connected: true, displayName: p.name || null },
  });
});

// Library
const fs = require("fs");
const path = require("path");

app.get("/api/library/reciters", async (req, res) => {
  const type = String(req.query.type || "").toLowerCase();
  const p = path.join(__dirname, "library", "reciters.json");
  const data = JSON.parse(fs.readFileSync(p, "utf8"));
  const out = type ? data.filter((r) => String(r.type).toLowerCase() === type) : data;
  res.json(out);
});

// Duas (local data)
app.get("/api/duas", async (req, res) => {
  const p = path.join(__dirname, "data", "duas.json");
  const data = JSON.parse(fs.readFileSync(p, "utf8"));
  res.json(data);
});

// Quran (public API)
app.get("/api/quran/surahs", async (req, res) => {
  const resp = await fetch("https://api.alquran.cloud/v1/surah");
  if (!resp.ok) return res.status(502).json({ error: "Quran upstream failed" });
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
});

app.get("/api/quran/surahs/:id", async (req, res) => {
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
});

// User settings (production persistence)

app.get("/api/user/settings", requireAmazonAuth, async (req, res) => {
  const pool = await getPool();
  const amazonUserId = req.amazonProfile.user_id;
  const userId = await ensureUser(pool, amazonUserId);

  const profile = await pool.request()
    .input("user_id", sql.UniqueIdentifier, userId)
    .query(`SELECT * FROM dbo.user_profiles WHERE user_id=@user_id`);

  const prayers = await pool.request()
    .input("user_id", sql.UniqueIdentifier, userId)
    .query(`
      SELECT prayer_name, enabled, offset_min, quiet_enabled, quiet_from, quiet_to, adhan_reciter_id, after_type, after_payload_json
      FROM dbo.prayer_configs WHERE user_id=@user_id
      ORDER BY prayer_name
    `);

  const p = profile.recordset[0] || {};

  res.json({
    userKey: amazonUserId,
    settings: {
      sect: p.sect,
      shia: p.sect === "SHIA",
      language: p.language,
      madhhab: p.madhhab,
      calculationMethod: p.calculation_method,
      highLatitudeMethod: p.high_latitude_method,
      country: p.country,
      city: p.city,
      timezone: p.timezone,
      accountEnabled: !!p.account_enabled,
      globalOffsets: {
        fajr: p.offset_fajr,
        dhuhr: p.offset_dhuhr,
        asr: p.offset_asr,
        maghrib: p.offset_maghrib,
        isha: p.offset_isha,
      },
      prayerConfigs: prayers.recordset.map((r) => {
        let afterPayload = null;
        try { afterPayload = r.after_payload_json ? JSON.parse(r.after_payload_json) : null; } catch { afterPayload = null; }

        return ({
          prayerName: r.prayer_name,
          enabled: !!r.enabled,
          offsetMin: r.offset_min,
          quietEnabled: !!r.quiet_enabled,
          quietFrom: r.quiet_from ? String(r.quiet_from).slice(0,5) : "22:00",
          quietTo: r.quiet_to ? String(r.quiet_to).slice(0,5) : "07:00",
          adhanReciterId: r.adhan_reciter_id || null,
          afterAdhan: {
            type: r.after_type || "none",
            payload: afterPayload
          }
        });
      }),
    },
  });
});

async function handlePutUserSettings(req, res) {
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

  const reqp = pool.request().input("user_id", sql.UniqueIdentifier, userId);

  if (sect !== undefined) reqp.input("sect", sql.NVarChar(10), String(sect).toUpperCase());
  if (calc !== undefined) reqp.input("calc", sql.NVarChar(50), String(calc));
  if (madhhab !== undefined) reqp.input("madhhab", sql.NVarChar(20), String(madhhab));
  if (high !== undefined) reqp.input("high", sql.NVarChar(30), String(high));
  if (language !== undefined) reqp.input("language", sql.NVarChar(10), String(language));
  if (country !== undefined) reqp.input("country", sql.NVarChar(64), String(country));
  if (city !== undefined) reqp.input("city", sql.NVarChar(128), String(city));
  if (timezone !== undefined) reqp.input("timezone", sql.NVarChar(64), String(timezone));
  if (accountEnabled !== undefined) reqp.input("account_enabled", sql.Bit, accountEnabled ? 1 : 0);

  reqp.input("off_fajr", sql.Int, offsets.fajr);
  reqp.input("off_dhuhr", sql.Int, offsets.dhuhr);
  reqp.input("off_asr", sql.Int, offsets.asr);
  reqp.input("off_maghrib", sql.Int, offsets.maghrib);
  reqp.input("off_isha", sql.Int, offsets.isha);

  await reqp.query(`
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

  // Prayer configs array
  const pcs = Array.isArray(body.prayerConfigs) ? body.prayerConfigs : null;
  if (pcs) {
    for (const pc of pcs) {
      const prayerName = String(pc.prayerName || pc.prayer_name || "").toLowerCase();
      if (!PRAYERS.includes(prayerName)) continue;

      const afterType = String(pc.afterAdhan?.type || pc.after_type || "none").toLowerCase();
      const afterPayload = pc.afterAdhan?.payload ?? pc.after_payload ?? null;
      const afterPayloadJson = afterPayload ? JSON.stringify(afterPayload) : null;

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

app.put("/api/user/settings", requireAmazonAuth, handlePutUserSettings);
app.post("/api/user/settings", requireAmazonAuth, handlePutUserSettings);

// Prayer times today (AlAdhan)
app.get("/api/prayer-times/today", requireAmazonAuth, async (req, res) => {
  const pool = await getPool();
  const amazonUserId = req.amazonProfile.user_id;
  const userId = await ensureUser(pool, amazonUserId);

  const profile = await pool.request()
    .input("user_id", sql.UniqueIdentifier, userId)
    .query(`SELECT * FROM dbo.user_profiles WHERE user_id=@user_id`);
  const p = profile.recordset[0];

  const prayers = await pool.request()
    .input("user_id", sql.UniqueIdentifier, userId)
    .query(`SELECT prayer_name, enabled, offset_min FROM dbo.prayer_configs WHERE user_id=@user_id`);

  const perPrayerOffset = {};
  const enabledMap = {};
  for (const r of prayers.recordset) {
    perPrayerOffset[r.prayer_name] = r.offset_min || 0;
    enabledMap[r.prayer_name] = !!r.enabled;
  }

  const method = mapCalcMethodToAlAdhan(p.calculation_method, p.sect);
  const school = madhhabToSchool(p.madhhab);

  const city = encodeURIComponent(p.city || "Chicago");
  const country = encodeURIComponent(p.country || "US");

  const url = `https://api.aladhan.com/v1/timingsByCity?city=${city}&country=${country}&method=${method}&school=${school}`;
  const resp = await fetch(url);
  if (!resp.ok) return res.status(502).json({ error: "Prayer API upstream failed" });
  const json = await resp.json();

  const t = json?.data?.timings || {};
  const base24 = {
    fajr: String(t.Fajr || "").slice(0,5),
    sunrise: String(t.Sunrise || "").slice(0,5),
    dhuhr: String(t.Dhuhr || "").slice(0,5),
    asr: String(t.Asr || "").slice(0,5),
    maghrib: String(t.Maghrib || "").slice(0,5),
    isha: String(t.Isha || "").slice(0,5),
  };

  const global = {
    fajr: p.offset_fajr || 0,
    dhuhr: p.offset_dhuhr || 0,
    asr: p.offset_asr || 0,
    maghrib: p.offset_maghrib || 0,
    isha: p.offset_isha || 0,
  };

  const adjusted24 = {
    fajr: addMinutesHHMM(base24.fajr, global.fajr + (perPrayerOffset.fajr||0)),
    sunrise: base24.sunrise,
    dhuhr: addMinutesHHMM(base24.dhuhr, global.dhuhr + (perPrayerOffset.dhuhr||0)),
    asr: addMinutesHHMM(base24.asr, global.asr + (perPrayerOffset.asr||0)),
    maghrib: addMinutesHHMM(base24.maghrib, global.maghrib + (perPrayerOffset.maghrib||0)),
    isha: addMinutesHHMM(base24.isha, global.isha + (perPrayerOffset.isha||0)),
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
    location: { city: p.city, country: p.country, timezone: p.timezone },
    method: { sect: p.sect, calculationMethod: p.calculation_method, madhhab: p.madhhab },
    enabled: enabledMap,
    prayers24: adjusted24,
    prayers12: adjusted12,
    date: json?.data?.date || null,
  });
});

// Alexa devices (DB-backed list)
app.get("/api/alexa/devices", requireAmazonAuth, async (req, res) => {
  const pool = await getPool();
  const amazonUserId = req.amazonProfile.user_id;
  const userId = await ensureUser(pool, amazonUserId);

  const r = await pool.request()
    .input("user_id", sql.UniqueIdentifier, userId)
    .query(`SELECT device_id AS id, device_name AS name, platform FROM dbo.devices WHERE user_id=@user_id AND platform='alexa' ORDER BY device_name`);

  res.json({ devices: r.recordset });
});

// Manual add device (for now)
app.post("/api/alexa/devices", requireAmazonAuth, async (req, res) => {
  const pool = await getPool();
  const amazonUserId = req.amazonProfile.user_id;
  const userId = await ensureUser(pool, amazonUserId);

  const { id, name } = req.body || {};
  if (!id || !name) return res.status(400).json({ error: "Provide {id, name}" });

  await pool.request()
    .input("user_id", sql.UniqueIdentifier, userId)
    .input("device_id", sql.NVarChar(255), String(id))
    .input("device_name", sql.NVarChar(255), String(name))
    .query(`
      MERGE dbo.devices AS target
      USING (SELECT @user_id AS user_id, 'alexa' AS platform, @device_id AS device_id) AS src
      ON target.user_id=src.user_id AND target.platform=src.platform AND target.device_id=src.device_id
      WHEN MATCHED THEN UPDATE SET device_name=@device_name
      WHEN NOT MATCHED THEN INSERT (user_id, platform, device_id, device_name) VALUES (@user_id, 'alexa', @device_id, @device_name);
    `);

  res.json({ ok: true });
});


// Schedules (Tilawat plans / future routines)
function daysArrayToMask(days) {
  // days: array of 7 booleans starting Sunday
  if (!Array.isArray(days) || days.length !== 7) return 127;
  let mask = 0;
  for (let i = 0; i < 7; i++) if (days[i]) mask |= (1 << i);
  return mask;
}
function maskToDaysArray(mask) {
  const m = Number(mask || 127);
  return Array.from({ length: 7 }, (_, i) => ((m >> i) & 1) === 1);
}

app.get("/api/user/schedules", requireAmazonAuth, async (req, res) => {
  const pool = await getPool();
  const amazonUserId = req.amazonProfile.user_id;
  const userId = await ensureUser(pool, amazonUserId);

  const r = await pool.request()
    .input("user_id", sql.UniqueIdentifier, userId)
    .query(`
      SELECT id, schedule_type, time_of_day, days_mask, enabled, device_id, payload_json, created_at
      FROM dbo.schedules
      WHERE user_id=@user_id
      ORDER BY created_at DESC
    `);

  const out = r.recordset.map((x) => {
    let payload = null;
    try { payload = x.payload_json ? JSON.parse(x.payload_json) : null; } catch { payload = null; }
    return {
      id: x.id,
      scheduleType: x.schedule_type,
      timeOfDay: String(x.time_of_day).slice(0,5),
      days: maskToDaysArray(x.days_mask),
      enabled: !!x.enabled,
      deviceId: x.device_id || null,
      payload,
      createdAt: x.created_at
    };
  });

  res.json({ schedules: out });
});

app.post("/api/user/schedules", requireAmazonAuth, async (req, res) => {
  const pool = await getPool();
  const amazonUserId = req.amazonProfile.user_id;
  const userId = await ensureUser(pool, amazonUserId);

  const body = req.body || {};
  const scheduleType = String(body.scheduleType || body.schedule_type || "tilawat").toLowerCase();
  const timeOfDay = String(body.timeOfDay || body.time_of_day || "").slice(0,5);
  const daysMask = daysArrayToMask(body.days);
  const enabled = body.enabled === false ? 0 : 1;
  const deviceId = body.deviceId ? String(body.deviceId) : null;

  if (!/^\d{2}:\d{2}$/.test(timeOfDay)) {
    return res.status(400).json({ error: "timeOfDay must be HH:MM" });
  }
  if (!["tilawat"].includes(scheduleType)) {
    return res.status(400).json({ error: "scheduleType must be 'tilawat' for MVP" });
  }

  const payload = body.payload;
  if (!payload || typeof payload !== "object") {
    return res.status(400).json({ error: "payload must be an object" });
  }

  // Basic validation for tilawat payload
  const surahNumber = Number(payload.surahNumber);
  if (!Number.isFinite(surahNumber) || surahNumber < 1 || surahNumber > 114) {
    return res.status(400).json({ error: "payload.surahNumber must be 1..114" });
  }

  const payloadJson = JSON.stringify({
    surahNumber,
    title: payload.title ? String(payload.title) : null,
    reciterId: payload.reciterId ? String(payload.reciterId) : null
  });

  const r = await pool.request()
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

  res.json({ ok: true, id: r.recordset[0]?.id });
});

app.delete("/api/user/schedules/:id", requireAmazonAuth, async (req, res) => {
  const pool = await getPool();
  const amazonUserId = req.amazonProfile.user_id;
  const userId = await ensureUser(pool, amazonUserId);

  const id = String(req.params.id);
  await pool.request()
    .input("id", sql.UniqueIdentifier, id)
    .input("user_id", sql.UniqueIdentifier, userId)
    .query(`DELETE FROM dbo.schedules WHERE id=@id AND user_id=@user_id`);

  res.json({ ok: true });
});


// Error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: String(err.message || err) });
});

const port = Number(process.env.PORT || 4000);
app.listen(port, () => {
  console.log(`AdhanHome API listening on ${port}`);
});

