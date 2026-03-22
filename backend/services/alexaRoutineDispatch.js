const fs = require('fs');
const path = require('path');
const { sql } = require('../db/sql');

const PRAYERS = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];

let recitersCache = null;
let duasCache = null;
let parsedAudioMap = null;
let parsedAfterAudioMap = null;

function readJson(relativePath) {
  const full = path.join(__dirname, '..', relativePath);
  const raw = fs.readFileSync(full, 'utf8');
  return JSON.parse(raw);
}

function readReciters() {
  if (recitersCache) return recitersCache;
  const data = readJson(path.join('library', 'reciters.json'));
  recitersCache = Array.isArray(data) ? data : [];
  return recitersCache;
}

function readDuas() {
  if (duasCache) return duasCache;
  const data = readJson(path.join('data', 'duas.json'));
  const categories = Array.isArray(data?.categories) ? data.categories : [];
  duasCache = categories.flatMap((category) => {
    const items = Array.isArray(category?.items) ? category.items : [];
    return items.filter((item) => item && typeof item === 'object');
  });
  return duasCache;
}

function getSkillInvocationName() {
  return String(process.env.ALEXA_SKILL_INVOCATION_NAME || 'adhan home').trim();
}

function getPublicApiBase(req) {
  const explicit = String(
    process.env.PUBLIC_API_BASE_URL || process.env.API_PUBLIC_BASE_URL || ''
  ).trim();
  if (explicit) return explicit.replace(/\/+$/, '');

  const proto = (req.headers['x-forwarded-proto'] || req.protocol || 'https')
    .toString()
    .split(',')[0]
    .trim();
  const host = String(req.headers['x-forwarded-host'] || req.get('host') || '').trim();
  return host ? `${proto}://${host}`.replace(/\/+$/, '') : '';
}

function absolutizePublicUrl(req, relativeOrAbsolute) {
  const raw = String(relativeOrAbsolute || '').trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  const base = getPublicApiBase(req);
  if (!base) return raw;
  return `${base}${raw.startsWith('/') ? raw : `/${raw}`}`;
}

function parseAudioMap() {
  if (parsedAudioMap) return parsedAudioMap;
  const raw = String(process.env.ADHAN_AUDIO_MAP_JSON || '').trim();
  if (!raw) {
    parsedAudioMap = {};
    return parsedAudioMap;
  }

  try {
    const parsed = JSON.parse(raw);
    parsedAudioMap = typeof parsed === 'object' && parsed && !Array.isArray(parsed) ? parsed : {};
  } catch {
    parsedAudioMap = {};
  }

  return parsedAudioMap;
}

function parseAfterAudioMap() {
  if (parsedAfterAudioMap) return parsedAfterAudioMap;
  const raw = String(process.env.AFTER_ADHAN_AUDIO_MAP_JSON || '').trim();
  if (!raw) {
    parsedAfterAudioMap = {};
    return parsedAfterAudioMap;
  }

  try {
    const parsed = JSON.parse(raw);
    parsedAfterAudioMap = typeof parsed === 'object' && parsed && !Array.isArray(parsed) ? parsed : {};
  } catch {
    parsedAfterAudioMap = {};
  }

  return parsedAfterAudioMap;
}

function resolveAdhanAudioUrl(req, reciterId) {
  const audioMap = parseAudioMap();
  const explicit = typeof audioMap[reciterId] === 'string' ? audioMap[reciterId].trim() : '';
  if (explicit) return absolutizePublicUrl(req, explicit);

  const defaults = {
    sudais: '/audio/adhan_makkah_sudais.mp3',
    'mishary-alafasy': '/audio/adhan_makkah_sudais.mp3',
    abdulbasit: '/audio/adhan_makkah_sudais.mp3',
  };

  return absolutizePublicUrl(req, defaults[reciterId] || '/audio/adhan_makkah_sudais.mp3');
}

function findReciter(reciterId) {
  const data = readReciters();
  return data.find((item) => String(item.id || '') === String(reciterId || '')) || null;
}

function normalizeAfterPayload(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  if (typeof value !== 'string') return null;
  try {
    const parsed = JSON.parse(value);
    return typeof parsed === 'object' && parsed ? parsed : null;
  } catch {
    return null;
  }
}

function resolveDuaMeta(duaId) {
  const list = readDuas();
  return list.find((item) => String(item.id || '') === String(duaId || '')) || null;
}

function resolveAfterAdhanMedia(req, afterType, afterPayload) {
  const map = parseAfterAudioMap();

  if (afterType === 'dua') {
    const duaId = String(afterPayload?.duaId || afterPayload?.id || '').trim();
    const key = `dua:${duaId}`;
    const mapped = typeof map[key] === 'string' ? map[key].trim() : '';
    const dua = resolveDuaMeta(duaId);
    const audioPath = mapped || String(dua?.audioPath || '').trim();
    return {
      label: String(dua?.title || afterPayload?.title || afterPayload?.name || duaId || 'selected dua'),
      audioUrl: absolutizePublicUrl(req, audioPath),
      payload: dua ? { ...afterPayload, duaId, title: dua.title } : afterPayload,
    };
  }

  if (afterType === 'surah') {
    const surahNumber = Number(afterPayload?.surahNumber);
    const key = `surah:${surahNumber}`;
    const mapped = typeof map[key] === 'string' ? map[key].trim() : '';
    let fallback = '';
    if (surahNumber === 1) fallback = '/audio/surahs/surah-fatiha.mp3';
    if (surahNumber === 112) fallback = '/audio/surahs/surah-ikhlas.mp3';
    return {
      label:
        String(afterPayload?.nameEnglish || afterPayload?.title || '').trim() ||
        (Number.isFinite(surahNumber) ? `Surah ${surahNumber}` : 'selected surah'),
      audioUrl: absolutizePublicUrl(req, mapped || fallback),
      payload: afterPayload,
    };
  }

  return {
    label: null,
    audioUrl: null,
    payload: afterPayload,
  };
}

function buildRoutineTemplates() {
  const invocationName = getSkillInvocationName();
  return PRAYERS.map((prayerName) => {
    const title = `${prayerName.charAt(0).toUpperCase()}${prayerName.slice(1)} Adhan`;
    return {
      id: prayerName,
      prayerName,
      title,
      routineName: `Adhan Home – ${title}`,
      phrase: `open ${invocationName} and play ${prayerName} adhan`,
    };
  });
}

function parseSelectedDeviceIds(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.filter((id) => typeof id === 'string' && id.trim());
  }
  if (typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((id) => typeof id === 'string' && id.trim())
      : [];
  } catch {
    return [];
  }
}

async function resolvePrayerPlaybackPlan(pool, params) {
  const { userId, prayerName, req, deviceId } = params;
  const normalizedPrayer = String(prayerName || '').trim().toLowerCase();
  if (!PRAYERS.includes(normalizedPrayer)) {
    const err = new Error('Unsupported prayer name.');
    err.status = 400;
    throw err;
  }

  const profileResult = await pool
    .request()
    .input('user_id', sql.UniqueIdentifier, userId)
    .query(`
      SELECT TOP 1
        account_enabled,
        city,
        country,
        timezone,
        mosque_name,
        calculation_method,
        madhhab,
        sect,
        selected_alexa_device_ids_json
      FROM dbo.user_profiles
      WHERE user_id = @user_id
    `);

  const profile = profileResult.recordset[0] || {};
  if (!profile.account_enabled) {
    const err = new Error('Account playback is disabled for this user.');
    err.status = 403;
    throw err;
  }

  const selectedDeviceIds = parseSelectedDeviceIds(profile.selected_alexa_device_ids_json);
  if (deviceId && selectedDeviceIds.length > 0 && !selectedDeviceIds.includes(String(deviceId))) {
    const err = new Error('This Alexa device is not enabled in Adhan Home settings.');
    err.status = 403;
    throw err;
  }

  const prayerResult = await pool
    .request()
    .input('user_id', sql.UniqueIdentifier, userId)
    .input('prayer_name', sql.NVarChar(10), normalizedPrayer)
    .query(`
      SELECT TOP 1 prayer_name, enabled, adhan_reciter_id, after_type, after_payload_json
      FROM dbo.prayer_configs
      WHERE user_id = @user_id AND prayer_name = @prayer_name
    `);

  const prayerRow = prayerResult.recordset[0] || null;
  if (!prayerRow || prayerRow.enabled === false) {
    const err = new Error('This prayer is disabled for playback.');
    err.status = 409;
    throw err;
  }

  const reciterId = prayerRow.adhan_reciter_id || 'sudais';
  const reciter = findReciter(reciterId);
  const afterPayload = normalizeAfterPayload(prayerRow.after_payload_json);
  const afterMedia = resolveAfterAdhanMedia(req, prayerRow.after_type, afterPayload);
  const prayerLabel = `${normalizedPrayer.charAt(0).toUpperCase()}${normalizedPrayer.slice(1)}`;

  const speechText = afterMedia.label
    ? afterMedia.audioUrl
      ? `Playing ${prayerLabel} Adhan, followed by ${afterMedia.label}.`
      : `Playing ${prayerLabel} Adhan. ${afterMedia.label} is selected after Adhan.`
    : `Playing ${prayerLabel} Adhan now.`;

  return {
    prayerName: normalizedPrayer,
    prayerLabel,
    reciterId,
    reciterName: reciter?.name || reciterId,
    audioUrl: resolveAdhanAudioUrl(req, reciterId),
    speechText,
    cardTitle: `${prayerLabel} Adhan`,
    cardText: afterMedia.label
      ? `${prayerLabel} Adhan • ${reciter?.name || reciterId} • Then ${afterMedia.label}`
      : `${prayerLabel} Adhan • ${reciter?.name || reciterId}`,
    afterAdhan: {
      type: prayerRow.after_type || 'none',
      label: afterMedia.label,
      payload: afterMedia.payload,
      audioUrl: afterMedia.audioUrl,
      supportedOnAlexa: !!afterMedia.audioUrl,
    },
    selectedDeviceIds,
    userContext: {
      city: profile.city || 'Chicago',
      country: profile.country || 'US',
      timezone: profile.timezone || 'Etc/UTC',
      mosqueName: profile.mosque_name || null,
      calculationMethod: profile.calculation_method || 'isna',
      madhhab: profile.madhhab || 'hanafi',
      sect: profile.sect || 'SUNNI',
      selectedDeviceIds,
    },
  };
}

async function logAlexaDispatch(pool, params) {
  const requestId = params.requestId ? String(params.requestId).slice(0, 255) : null;
  const prayerName = params.prayerName ? String(params.prayerName).slice(0, 20) : null;
  const deviceId = params.deviceId ? String(params.deviceId).slice(0, 255) : null;
  const triggerSource = String(params.triggerSource || 'skill').slice(0, 40);
  const status = String(params.status || 'queued').slice(0, 30);
  const message = params.message ? String(params.message).slice(0, 1000) : null;
  let payloadJson = null;
  try {
    payloadJson = params.payload ? JSON.stringify(params.payload) : null;
  } catch {
    payloadJson = null;
  }

  await pool
    .request()
    .input('user_id', sql.UniqueIdentifier, params.userId || null)
    .input('request_id', sql.NVarChar(255), requestId)
    .input('prayer_name', sql.NVarChar(20), prayerName)
    .input('device_id', sql.NVarChar(255), deviceId)
    .input('trigger_source', sql.NVarChar(40), triggerSource)
    .input('status', sql.NVarChar(30), status)
    .input('message', sql.NVarChar(1000), message)
    .input('payload_json', sql.NVarChar(sql.MAX), payloadJson)
    .query(`
      INSERT INTO dbo.alexa_dispatch_log (
        user_id,
        request_id,
        prayer_name,
        device_id,
        trigger_source,
        status,
        message,
        payload_json
      )
      VALUES (
        @user_id,
        @request_id,
        @prayer_name,
        @device_id,
        @trigger_source,
        @status,
        @message,
        @payload_json
      )
    `);
}

module.exports = {
  buildRoutineTemplates,
  getSkillInvocationName,
  resolvePrayerPlaybackPlan,
  logAlexaDispatch,
};
