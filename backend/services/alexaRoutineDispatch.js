const fs = require('fs');
const path = require('path');
const { sql } = require('../db/sql');

const PRAYERS = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];

let recitersCache = null;
let duasCache = null;
let parsedAudioMap = null;

function createAlexaSkillError(statusCode, code, message, extra = {}) {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.status = statusCode;
  err.code = code;
  Object.assign(err, extra);
  return err;
}

function normalizePrayerLabel(prayerName) {
  const raw = String(prayerName || '').trim().toLowerCase();

  if (raw === 'fajr') return 'Fajr';
  if (raw === 'dhuhr') return 'Dhuhr';
  if (raw === 'asr') return 'Asr';
  if (raw === 'maghrib') return 'Maghrib';
  if (raw === 'isha') return 'Isha';
  if (raw === 'sunrise') return 'Sunrise';

  return raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : 'Prayer';
}

function readJson(relativePath) {
  const full = path.join(__dirname, '..', relativePath);
  return JSON.parse(fs.readFileSync(full, 'utf8'));
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
  duasCache = [];

  if (data && Array.isArray(data.categories)) {
    for (const category of data.categories) {
      if (!category || !Array.isArray(category.items)) continue;
      for (const item of category.items) {
        if (item && typeof item === 'object') {
          duasCache.push(item);
        }
      }
    }
  }

  return duasCache;
}

function getSkillInvocationName() {
  return String(process.env.ALEXA_SKILL_INVOCATION_NAME || 'adhan cast').trim();
}

function getPublicApiBase(req) {
  const explicit =
    String(process.env.PUBLIC_API_BASE_URL || process.env.API_PUBLIC_BASE_URL || '').trim();
  if (explicit) return explicit.replace(/\/+$/, '');

  const proto = (req.headers['x-forwarded-proto'] || req.protocol || 'https')
    .toString()
    .split(',')[0]
    .trim();
  const host = String(req.headers['x-forwarded-host'] || req.get('host') || '').trim();
  return host ? `${proto}://${host}`.replace(/\/+$/, '') : '';
}

function makeAbsoluteUrl(req, value) {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return '';
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

function normalizeId(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
}

function findReciter(reciterId) {
  const wanted = normalizeId(reciterId);
  if (!wanted) return null;

  return (
    readReciters().find((item) => {
      const itemId = normalizeId(item.id);
      if (itemId === wanted) return true;

      const aliases = Array.isArray(item.aliases) ? item.aliases : [];
      return aliases.some((alias) => normalizeId(alias) === wanted);
    }) || null
  );
}

function resolveAudioUrl(req, reciterId) {
  const audioMap = parseAudioMap();
  const explicitEnv = typeof audioMap[reciterId] === 'string' ? audioMap[reciterId].trim() : '';
  if (explicitEnv) return makeAbsoluteUrl(req, explicitEnv);

  const reciter = findReciter(reciterId);
  const explicitJson =
    (typeof reciter?.audioUrl === 'string' && reciter.audioUrl.trim()) ||
    (typeof reciter?.audioPath === 'string' && reciter.audioPath.trim()) ||
    (typeof reciter?.audio === 'string' && reciter.audio.trim()) ||
    '';

  if (explicitJson) return makeAbsoluteUrl(req, explicitJson);

  return makeAbsoluteUrl(req, '/audio/adhan_makkah_sudais.mp3');
}

function getSurahAudioEdition() {
  const value = String(process.env.ADHAN_QURAN_SURAH_AUDIO_EDITION || 'ar.alafasy').trim();
  return value || 'ar.alafasy';
}

function getSurahAudioBitrate() {
  const value = String(process.env.ADHAN_QURAN_SURAH_AUDIO_BITRATE || '128').trim();
  return ['192', '128', '64', '48', '40', '32'].includes(value) ? value : '128';
}

function resolveSurahAudioUrl(surahNumber) {
  const n = Number(surahNumber);
  if (!Number.isInteger(n) || n < 1 || n > 114) return '';

  const edition = getSurahAudioEdition();
  const bitrate = getSurahAudioBitrate();

  return `https://cdn.islamic.network/quran/audio-surah/${bitrate}/${edition}/${n}.mp3`;
}

function findDua(duaId) {
  const wanted = normalizeId(duaId);
  if (!wanted) return null;

  return (
    readDuas().find((item) => {
      const itemId = normalizeId(item.id);
      if (itemId === wanted) return true;

      const aliases = Array.isArray(item.aliases) ? item.aliases : [];
      return aliases.some((alias) => normalizeId(alias) === wanted);
    }) || null
  );
}

function parseStringArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .filter((item) => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean);
  }
  if (typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item) => typeof item === 'string').map((item) => item.trim()).filter(Boolean)
      : [];
  } catch {
    return [];
  }
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

function enrichAfterPayload(req, afterType, afterPayload) {
  if (!afterPayload || typeof afterPayload !== 'object') {
    return afterPayload;
  }

  if (afterType === 'dua') {
    const duaId = afterPayload.duaId || afterPayload.id;
    const dua = findDua(duaId);
    if (!dua) return afterPayload;

    return {
      ...afterPayload,
      duaId: afterPayload.duaId || dua.id,
      id: afterPayload.id || dua.id,
      title: afterPayload.title || dua.title,
      translation: afterPayload.translation || dua.translation || null,
      audioUrl:
        afterPayload.audioUrl ||
        makeAbsoluteUrl(req, dua.audioUrl || dua.audioPath || dua.audio),
    };
  }

  if (afterType === 'surah') {
    const surahNumber = Number(afterPayload.surahNumber || afterPayload.number);
    if (!Number.isInteger(surahNumber) || surahNumber < 1 || surahNumber > 114) {
      return afterPayload;
    }

    return {
      ...afterPayload,
      surahNumber,
      number: afterPayload.number || surahNumber,
      title: afterPayload.title || `Surah ${surahNumber}`,
      nameEnglish: afterPayload.nameEnglish || afterPayload.title || `Surah ${surahNumber}`,
      audioUrl: afterPayload.audioUrl || resolveSurahAudioUrl(surahNumber),
    };
  }

  return afterPayload;
}

function buildAfterAdhanLabel(afterType, afterPayload) {
  if (afterType === 'dua') {
    return afterPayload?.title || afterPayload?.name || afterPayload?.id || 'selected dua';
  }
  if (afterType === 'surah') {
    return (
      afterPayload?.nameEnglish ||
      afterPayload?.title ||
      (afterPayload?.surahNumber ? `Surah ${afterPayload.surahNumber}` : 'selected surah')
    );
  }
  return null;
}

function buildRoutineTemplates() {
  const invocationName = getSkillInvocationName();
  return PRAYERS.map((prayerName) => {
    const title = `${normalizePrayerLabel(prayerName)} Adhan`;
    return {
      id: prayerName,
      prayerName,
      title,
      routineName: `AdhanCast – ${title}`,
      phrase: `open ${invocationName} and play ${prayerName} adhan`,
    };
  });
}


async function resolvePrayerPlaybackPlan(pool, params) {
  const { userId, prayerName, req, deviceId } = params;

  const normalizedPrayer = String(prayerName || '').trim().toLowerCase();
  const normalizedDeviceId = String(deviceId || '').trim();

  if (!PRAYERS.includes(normalizedPrayer)) {
    throw createAlexaSkillError(
      400,
      'UNSUPPORTED_PRAYER',
      'Unsupported prayer name.',
      {
        prayerName: normalizedPrayer,
        deviceId: normalizedDeviceId || null,
      }
    );
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
    throw createAlexaSkillError(
      403,
      'AUTOMATION_DISABLED',
      'Adhan automation is disabled for this account.',
      {
        prayerName: normalizedPrayer,
        deviceId: normalizedDeviceId || null,
      }
    );
  }

  const selectedDeviceIds = parseStringArray(profile.selected_alexa_device_ids_json);

  if (selectedDeviceIds.length > 0) {
    if (!normalizedDeviceId) {
      throw createAlexaSkillError(
        403,
        'DEVICE_NOT_ENABLED',
        'This Alexa request did not include a device ID, so playback could not be verified against your selected devices.',
        {
          prayerName: normalizedPrayer,
          deviceId: null,
          selectedDeviceIds,
        }
      );
    }

    if (!selectedDeviceIds.includes(normalizedDeviceId)) {
      throw createAlexaSkillError(
        403,
        'DEVICE_NOT_ENABLED',
        'This Alexa device is not enabled in AdhanCast settings.',
        {
          prayerName: normalizedPrayer,
          deviceId: normalizedDeviceId,
          selectedDeviceIds,
        }
      );
    }
  }

  const prayerResult = await pool
    .request()
    .input('user_id', sql.UniqueIdentifier, userId)
    .input('prayer_name', sql.NVarChar(10), normalizedPrayer)
    .query(`
      SELECT TOP 1
        prayer_name,
        enabled,
        adhan_reciter_id,
        after_type,
        after_payload_json
      FROM dbo.prayer_configs
      WHERE user_id = @user_id AND prayer_name = @prayer_name
    `);

  const prayerRow = prayerResult.recordset[0] || null;

  if (!prayerRow || prayerRow.enabled === false) {
    throw createAlexaSkillError(
      403,
      'PRAYER_DISABLED',
      `${normalizePrayerLabel(normalizedPrayer)} is disabled in AdhanCast settings.`,
      {
        prayerName: normalizedPrayer,
        deviceId: normalizedDeviceId || null,
      }
    );
  }

  const reciterId =
    typeof prayerRow.adhan_reciter_id === 'string' && prayerRow.adhan_reciter_id.trim()
      ? prayerRow.adhan_reciter_id.trim()
      : null;

  if (!reciterId) {
    throw createAlexaSkillError(
      409,
      'RECITER_NOT_CONFIGURED',
      `No Adhan reciter is configured for ${normalizePrayerLabel(normalizedPrayer)}.`,
      {
        prayerName: normalizedPrayer,
        deviceId: normalizedDeviceId || null,
      }
    );
  }

  const reciter = findReciter(reciterId);
  const audioUrl = resolveAudioUrl(req, reciterId);

  if (!audioUrl) {
    throw createAlexaSkillError(
      502,
      'AUDIO_NOT_AVAILABLE',
      `Audio is not available for ${normalizePrayerLabel(normalizedPrayer)}.`,
      {
        prayerName: normalizedPrayer,
        deviceId: normalizedDeviceId || null,
        reciterId,
      }
    );
  }

  const afterType = prayerRow.after_type || 'none';
  const afterPayload = enrichAfterPayload(
    req,
    afterType,
    normalizeAfterPayload(prayerRow.after_payload_json)
  );
  const afterLabel = buildAfterAdhanLabel(afterType, afterPayload);

  return {
    prayerName: normalizedPrayer,
    prayerLabel: normalizePrayerLabel(normalizedPrayer),
    audioUrl,
    reciterId,
    reciterName: reciter?.name || null,
    speechText: `Playing ${normalizePrayerLabel(normalizedPrayer)} adhan.`,
    cardTitle: 'AdhanCast',
    cardText: `Playing ${normalizePrayerLabel(normalizedPrayer)} adhan.`,
    afterAdhan: afterType === 'none'
      ? null
      : {
          type: afterType,
          label: afterLabel,
          payload: afterPayload,
          audioUrl: afterPayload?.audioUrl || null,
        },
    userContext: {
      accountEnabled: true,
      city: profile.city || 'Chicago',
      country: profile.country || 'US',
      timezone: profile.timezone || 'Etc/UTC',
      mosqueName: profile.mosque_name || null,
      calculationMethod: profile.calculation_method || 'isna',
      madhhab: profile.madhhab || 'hanafi',
      sect: profile.sect || 'SUNNI',
      selectedDeviceIds,
      requestedDeviceId: normalizedDeviceId || null,
      deviceId: normalizedDeviceId || null,
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