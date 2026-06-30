const API_BASE = String(
  process.env.API_BASE_URL || process.env.BACKEND_BASE_URL || ""
).replace(/\/+$/, "");

const PRAYER_ORDER = ["fajr", "dhuhr", "asr", "maghrib", "isha"];
const PRAYER_TIME_ORDER = ["fajr", "sunrise", "dhuhr", "asr", "maghrib", "isha"];
const DEFAULT_LOCALE = "en-US";
const REQUEST_TIMEOUT_MS = 6500;

function getRequestType(event) {
  return event?.request?.type || "";
}

function getIntentName(event) {
  return event?.request?.intent?.name || "";
}

function getSlotValue(event, slotName) {
  return event?.request?.intent?.slots?.[slotName]?.value || "";
}

function getAccessToken(event) {
  return (
    event?.context?.System?.user?.accessToken ||
    event?.session?.user?.accessToken ||
    ""
  );
}

function getAlexaUserId(event) {
  return event?.context?.System?.user?.userId || null;
}

function getDeviceId(event) {
  return event?.context?.System?.device?.deviceId || null;
}

function getRequestId(event) {
  return event?.request?.requestId || null;
}

function getLocale(event) {
  return event?.request?.locale || DEFAULT_LOCALE;
}

function textResponse(text, options = {}) {
  const response = {
    version: "1.0",
    response: {
      shouldEndSession:
        typeof options.shouldEndSession === "boolean"
          ? options.shouldEndSession
          : true,
    },
  };

  if (text) {
    response.response.outputSpeech = {
      type: "PlainText",
      text,
    };
  }

  if (options.card) {
    response.response.card = options.card;
  }

  if (options.reprompt) {
    response.response.reprompt = {
      outputSpeech: {
        type: "PlainText",
        text: options.reprompt,
      },
    };
  }

  if (options.directives) {
    response.response.directives = options.directives;
  }

  return response;
}

function linkAccountResponse(text) {
  return textResponse(text, {
    card: { type: "LinkAccount" },
    shouldEndSession: true,
  });
}

function stopAudioResponse(text = "Okay.") {
  return textResponse(text, {
    directives: [{ type: "AudioPlayer.Stop" }],
    shouldEndSession: true,
  });
}

function audioPlayDirective(
  url,
  token,
  playBehavior = "REPLACE_ALL",
  expectedPreviousToken
) {
  const directive = {
    type: "AudioPlayer.Play",
    playBehavior,
    audioItem: {
      stream: {
        token,
        url,
        offsetInMilliseconds: 0,
      },
    },
  };

  if (playBehavior === "ENQUEUE" && expectedPreviousToken) {
    directive.audioItem.stream.expectedPreviousToken = expectedPreviousToken;
  }

  return directive;
}

function audioResponse({
  speechText,
  audioUrl,
  token,
  cardTitle,
  cardText,
  suppressSpeech = false,
}) {
  return textResponse(suppressSpeech ? "" : speechText, {
    card: {
      type: "Simple",
      title: cardTitle || "AdhanCast",
      content: cardText || speechText || "Playing audio.",
    },
    directives: [audioPlayDirective(audioUrl, token)],
    shouldEndSession: true,
  });
}

function encodeToken(payload) {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function decodeToken(token) {
  try {
    return JSON.parse(
      Buffer.from(String(token || ""), "base64url").toString("utf8")
    );
  } catch {
    return null;
  }
}

function buildAdhanToken({ prayerName, afterAudioUrl, afterLabel }) {
  return encodeToken({
    k: "a",
    p: prayerName || null,
    u: afterAudioUrl || null,
    l: afterLabel || null,
  });
}

function buildAfterAdhanToken({ prayerName, label }) {
  return encodeToken({
    k: "aa",
    p: prayerName || null,
    l: label || null,
  });
}

function hhmmToMinutes(value) {
  const match = String(value || "").match(/^(\d{1,2}):(\d{2})/);
  if (!match) return 0;
  return Number(match[1]) * 60 + Number(match[2]);
}

function currentHHMM(timeZone) {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: timeZone || "UTC",
    }).formatToParts(new Date());

    const hour = parts.find((p) => p.type === "hour")?.value || "00";
    const minute = parts.find((p) => p.type === "minute")?.value || "00";
    return `${hour}:${minute}`;
  } catch {
    const now = new Date();
    return `${String(now.getUTCHours()).padStart(2, "0")}:${String(
      now.getUTCMinutes()
    ).padStart(2, "0")}`;
  }
}

function choosePrayerFromTimes(data, explicitPrayer) {
  const prayers24 = data?.prayers24 || {};

  if (explicitPrayer && prayers24[explicitPrayer]) {
    return explicitPrayer;
  }

  const tz = data?.location?.timezone || data?.userContext?.timezone || "UTC";
  const now = currentHHMM(tz);
  const nowMinutes = hhmmToMinutes(now);

  for (const prayer of PRAYER_ORDER) {
    const value = prayers24[prayer];
    if (!value) continue;
    if (hhmmToMinutes(value) >= nowMinutes) return prayer;
  }

  return "fajr";
}

function isHttpsAudioUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:";
  } catch {
    return false;
  }
}

async function requestJson(method, url, accessToken, body) {
  if (!API_BASE) {
    throw new Error("API_BASE_URL or BACKEND_BASE_URL is not configured.");
  }

  const headers = {
    Accept: "application/json",
  };

  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    const text = await response.text();

    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }

    if (!response.ok) {
      const message =
        json?.error ||
        json?.message ||
        text ||
        `HTTP ${response.status} calling ${url}`;

      const err = new Error(message);
      err.statusCode = response.status;
      err.payload = json;
      err.code = json?.code || null;
      throw err;
    }

    return json || {};
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchPrayerTimes(event) {
  const accessToken = getAccessToken(event);
  const params = new URLSearchParams();
  if (getDeviceId(event)) params.set("deviceId", String(getDeviceId(event)));
  if (getAlexaUserId(event)) params.set("alexaUserId", String(getAlexaUserId(event)));
  if (getRequestId(event)) params.set("requestId", String(getRequestId(event)));
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return requestJson(
    "GET",
    `${API_BASE}/api/alexa/skill/prayer-times${suffix}`,
    accessToken
  );
}

async function markCurrentDeviceSeen(event) {
  const accessToken = getAccessToken(event);
  if (!accessToken || !getDeviceId(event)) return null;

  try {
    return await requestJson(
      "POST",
      `${API_BASE}/api/alexa/skill/device-seen`,
      accessToken,
      {
        requestId: getRequestId(event),
        deviceId: getDeviceId(event),
        alexaUserId: getAlexaUserId(event),
        locale: getLocale(event),
      }
    );
  } catch (err) {
    console.warn("Device-seen sync failed:", err?.message || err);
    return null;
  }
}

async function fetchPlaybackPlan(event, prayerName) {
  const accessToken = getAccessToken(event);

  return requestJson(
    "POST",
    `${API_BASE}/api/alexa/skill/playback`,
    accessToken,
    {
      prayerName,
      prayer: prayerName,
      requestId: getRequestId(event),
      deviceId: getDeviceId(event),
      alexaUserId: getAlexaUserId(event),
      locale: getLocale(event),
    }
  );
}

function normalizePrayer(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";

  if (raw.includes("next prayer") || raw === "next") return "__next__";
  if (raw.includes("sunrise") || raw.includes("sun rise")) return "sunrise";
  if (raw.includes("fajr") || raw.includes("fajar")) return "fajr";
  if (
    raw.includes("dhuhr") ||
    raw.includes("duhur") ||
    raw.includes("zuhr") ||
    raw.includes("zuhar")
  ) {
    return "dhuhr";
  }
  if (raw.includes("asr") || raw.includes("assar")) return "asr";
  if (raw.includes("maghrib")) return "maghrib";
  if (raw.includes("isha")) return "isha";

  return raw;
}

function formatPrayerLabel(prayer) {
  if (!prayer) return "";
  if (prayer === "sunrise") return "Sunrise";
  return prayer.charAt(0).toUpperCase() + prayer.slice(1);
}

function getNextPrayerInfo(data) {
  const prayers24 = data?.prayers24 || {};
  const prayers12 = data?.prayers12 || {};
  const tz = data?.location?.timezone || data?.userContext?.timezone || "UTC";
  const nowMinutes = hhmmToMinutes(currentHHMM(tz));

  for (const prayer of PRAYER_ORDER) {
    const value = prayers24[prayer];
    if (!value) continue;
    if (hhmmToMinutes(value) >= nowMinutes) {
      return {
        prayer,
        time12: prayers12[prayer] || null,
        time24: value,
      };
    }
  }

  const fallbackPrayer = PRAYER_ORDER[0];
  return {
    prayer: fallbackPrayer,
    time12: prayers12[fallbackPrayer] || null,
    time24: prayers24[fallbackPrayer] || null,
  };
}

function buildSkillErrorResponse(err, fallbackText) {
  const statusCode = Number(err?.statusCode || 0);
  const code =
    typeof err?.code === "string"
      ? err.code
      : typeof err?.payload?.code === "string"
      ? err.payload.code
      : "";

  if (statusCode === 401) {
    return linkAccountResponse(
      "Please re-link your AdhanCast account in the Alexa app."
    );
  }

  if (code === "AUTOMATION_DISABLED") {
    return textResponse(
      "Adhan automation is currently turned off in your AdhanCast settings."
    );
  }

  if (code === "DEVICE_NOT_ENABLED") {
    return textResponse(
      "This Alexa device is not selected in your AdhanCast settings."
    );
  }

  if (code === "PRAYER_DISABLED") {
    return textResponse(
      "That prayer is currently disabled in your AdhanCast settings."
    );
  }

  if (code === "RECITER_NOT_CONFIGURED") {
    return textResponse(
      "You have not selected an Adhan reciter for that prayer yet."
    );
  }

  if (code === "AUDIO_NOT_AVAILABLE") {
    return textResponse(
      "I found the prayer, but the audio is not available right now."
    );
  }

  return textResponse(fallbackText);
}

async function handleLaunch(event) {
  const accessToken = getAccessToken(event);

  if (!accessToken) {
    return linkAccountResponse(
      "Please link your AdhanCast account in the Alexa app to use personalized prayer playback."
    );
  }

  await markCurrentDeviceSeen(event);

  // Play-on-launch (Gap 3): a doorbell-triggered Alexa Routine opens this skill
  // with a plain LaunchRequest. Ask the backend whether a prayer is due right
  // now; if so, reuse the existing playback path and play that Adhan instead of
  // the welcome message. Any error or "not due" falls through to the normal
  // welcome below, so first-time launch is never broken.
  try {
    const params = new URLSearchParams();
    if (getDeviceId(event)) params.set("deviceId", String(getDeviceId(event)));
    const suffix = params.toString() ? `?${params.toString()}` : "";
    const dueNow = await requestJson(
      "GET",
      `${API_BASE}/api/alexa/skill/due-now${suffix}`,
      accessToken
    );

    if (dueNow?.due === true && dueNow?.prayerName) {
      const prayerName = dueNow.prayerName;
      const playback = await fetchPlaybackPlan(event, prayerName);

      if (
        playback?.audioUrl &&
        isHttpsAudioUrl(playback.audioUrl) &&
        !(
          playback?.afterAdhan?.audioUrl &&
          !isHttpsAudioUrl(playback.afterAdhan.audioUrl)
        )
      ) {
        const primaryToken = buildAdhanToken({
          prayerName: playback.prayerName || prayerName,
          afterAudioUrl: playback?.afterAdhan?.audioUrl || null,
          afterLabel: playback?.afterAdhan?.label || null,
        });

        return audioResponse({
          speechText:
            playback.speechText ||
            `Playing ${playback.prayerLabel || prayerName} adhan.`,
          audioUrl: playback.audioUrl,
          token: primaryToken,
          cardTitle: playback.cardTitle || "AdhanCast",
          cardText:
            playback.cardText ||
            `Playing ${playback.prayerLabel || prayerName} adhan.`,
          suppressSpeech: true,
        });
      }
    }
  } catch (err) {
    console.warn("Play-on-launch check failed:", err?.message || err);
  }

  return textResponse(
    "Welcome to AdhanCast. You can say play Fajr adhan, say play adhan for the next prayer, ask what time is Maghrib, or ask what is the next prayer.",
    {
      shouldEndSession: false,
      reprompt: "Try saying, what is the next prayer, or play Fajr adhan.",
    }
  );
}

async function handlePlayAdhan(event) {
  const accessToken = getAccessToken(event);

  if (!accessToken) {
    return linkAccountResponse(
      "Please link your AdhanCast account in the Alexa app first."
    );
  }

  try {
    await markCurrentDeviceSeen(event);

    const requestedPrayer = normalizePrayer(getSlotValue(event, "prayer"));
    const prayerTimes = await fetchPrayerTimes(event);
    const prayerName = choosePrayerFromTimes(prayerTimes, requestedPrayer);
    const playback = await fetchPlaybackPlan(event, prayerName);

    if (!playback?.audioUrl) {
      throw new Error("Playback plan did not include an audio URL.");
    }

    if (!isHttpsAudioUrl(playback.audioUrl)) {
      throw new Error("Playback plan returned a non-HTTPS audio URL.");
    }

    if (
      playback?.afterAdhan?.audioUrl &&
      !isHttpsAudioUrl(playback.afterAdhan.audioUrl)
    ) {
      throw new Error("After Adhan playback URL is not HTTPS.");
    }

    const primaryToken = buildAdhanToken({
      prayerName: playback.prayerName || prayerName,
      afterAudioUrl: playback?.afterAdhan?.audioUrl || null,
      afterLabel: playback?.afterAdhan?.label || null,
    });

    return audioResponse({
      speechText:
        playback.speechText ||
        `Playing ${playback.prayerLabel || prayerName} adhan.`,
      audioUrl: playback.audioUrl,
      token: primaryToken,
      cardTitle: playback.cardTitle || "AdhanCast",
      cardText:
        playback.cardText ||
        `Playing ${playback.prayerLabel || prayerName} adhan.`,
      suppressSpeech: true,
    });
  } catch (err) {
    console.error("PlayAdhanIntent error:", err);
    return buildSkillErrorResponse(
      err,
      "I could not start adhan playback right now. Please try again."
    );
  }
}

async function handleGetPrayerTimes(event) {
  const accessToken = getAccessToken(event);

  if (!accessToken) {
    return linkAccountResponse(
      "Please link your AdhanCast account in the Alexa app first."
    );
  }

  try {
    await markCurrentDeviceSeen(event);

    const prayer = normalizePrayer(getSlotValue(event, "prayer"));
    const data = await fetchPrayerTimes(event);
    const prayers12 = data?.prayers12 || {};

    if (prayer === "__next__") {
      const nextPrayer = getNextPrayerInfo(data);
      return textResponse(
        `Your next prayer is ${formatPrayerLabel(nextPrayer.prayer)} at ${
          nextPrayer.time12 || nextPrayer.time24 || "an unavailable time"
        }.`
      );
    }

    if (prayer && PRAYER_TIME_ORDER.includes(prayer) && prayers12[prayer]) {
      return textResponse(
        `${formatPrayerLabel(prayer)} is at ${prayers12[prayer]}.`
      );
    }

    if (prayer && !PRAYER_TIME_ORDER.includes(prayer)) {
      return textResponse(
        "I can help with Fajr, Sunrise, Dhuhr, Asr, Maghrib, and Isha."
      );
    }

    return textResponse(
      `Today's prayer times are: Fajr at ${prayers12.fajr || "not available"}, Sunrise at ${
        prayers12.sunrise || "not available"
      }, Dhuhr at ${prayers12.dhuhr || "not available"}, Asr at ${
        prayers12.asr || "not available"
      }, Maghrib at ${prayers12.maghrib || "not available"}, and Isha at ${
        prayers12.isha || "not available"
      }.`
    );
  } catch (err) {
    console.error("GetPrayerTimesIntent error:", err);
    return buildSkillErrorResponse(
      err,
      "I could not reach your AdhanCast server right now. Please try again."
    );
  }
}

async function handleGetNextPrayer(event) {
  const accessToken = getAccessToken(event);

  if (!accessToken) {
    return linkAccountResponse(
      "Please link your AdhanCast account in the Alexa app first."
    );
  }

  try {
    await markCurrentDeviceSeen(event);
    const data = await fetchPrayerTimes(event);
    const nextPrayer = getNextPrayerInfo(data);
    return textResponse(
      `Your next prayer is ${formatPrayerLabel(nextPrayer.prayer)} at ${
        nextPrayer.time12 || nextPrayer.time24 || "an unavailable time"
      }.`
    );
  } catch (err) {
    console.error("GetNextPrayerIntent error:", err);
    return buildSkillErrorResponse(
      err,
      "I could not reach your AdhanCast server right now. Please try again."
    );
  }
}

async function handleAudioPlayerEvent(event) {
  const requestType = getRequestType(event);

  if (requestType === "AudioPlayer.PlaybackNearlyFinished") {
    const currentToken =
      event?.context?.AudioPlayer?.token || event?.request?.token || "";
    const parsed = decodeToken(currentToken);

    if (parsed?.k === "a" && parsed?.u) {
      const afterToken = buildAfterAdhanToken({
        prayerName: parsed.p,
        label: parsed.l || null,
      });

      return {
        version: "1.0",
        response: {
          directives: [
            audioPlayDirective(parsed.u, afterToken, "ENQUEUE", currentToken),
          ],
          shouldEndSession: true,
        },
      };
    }
  }

  return {
    version: "1.0",
    response: {},
  };
}

exports.handler = async (event) => {
  try {
    const requestType = getRequestType(event);

    if (requestType === "LaunchRequest") {
      return await handleLaunch(event);
    }

    if (requestType === "SessionEndedRequest") {
      return { version: "1.0", response: {} };
    }

    if (requestType.startsWith("AudioPlayer.")) {
      return await handleAudioPlayerEvent(event);
    }

    if (requestType === "IntentRequest") {
      const intentName = getIntentName(event);

      switch (intentName) {
        case "PlayAdhanIntent":
          return await handlePlayAdhan(event);

        case "GetPrayerTimesIntent":
          return await handleGetPrayerTimes(event);

        case "GetNextPrayerIntent":
          return await handleGetNextPrayer(event);

        case "PlayNextPrayerIntent":
          return await handlePlayAdhan(event);

        case "AMAZON.NavigateHomeIntent":
          return textResponse("Welcome back to AdhanCast. You can ask what is the next prayer, ask what time is Fajr, or say play Fajr adhan.", { shouldEndSession: false, reprompt: "Try saying, what is the next prayer, or play Fajr adhan." });

        case "AMAZON.HelpIntent":
          return textResponse(
            "You can say play Fajr adhan, say play adhan for the next prayer, ask what time is Fajr, ask what time is Sunrise, or ask what is the next prayer.",
            {
              shouldEndSession: false,
              reprompt:
                "Try saying, what is the next prayer, or play Fajr adhan.",
            }
          );

        case "AMAZON.StopIntent":
        case "AMAZON.CancelIntent":
        case "AMAZON.PauseIntent":
          return stopAudioResponse("Okay.");

        case "AMAZON.ResumeIntent":
          return textResponse(
            "Say play Fajr adhan, say play adhan for the next prayer, or ask what is the next prayer."
          );

        case "AMAZON.FallbackIntent":
          return textResponse(
            "Sorry, I didn't understand that. Try saying play Fajr adhan, ask what time is Maghrib, or ask what is the next prayer."
          );

        default:
          return textResponse("Sorry, I could not handle that request.");
      }
    }

    return textResponse("Sorry, I could not handle that request.");
  } catch (err) {
    console.error("Unhandled Lambda error:", err);
    return textResponse("Sorry, something went wrong.");
  }
};
