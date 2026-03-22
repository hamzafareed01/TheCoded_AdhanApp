import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { AppUser } from "../../types/AppUser";
import {
  apiFetch,
  getStoredAmazonToken,
  subscribeToAmazonAuthChanges,
} from "../../lib/api";
import TestAdhanButton from "./TestAdhanButton";
import { Logo } from "../shared/Logo";
import { Navigation } from "../shared/Navigation";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import {
  Building2,
  CheckCircle,
  Edit,
  Settings as SettingsIcon,
  Volume2,
} from "lucide-react";

const PRAYER_ORDER = [
  "fajr",
  "sunrise",
  "dhuhr",
  "asr",
  "maghrib",
  "isha",
] as const;

type PrayerCode = (typeof PRAYER_ORDER)[number];

const COUNTDOWN_PRAYERS: PrayerCode[] = [
  "fajr",
  "dhuhr",
  "asr",
  "maghrib",
  "isha",
];

const PRAYER_LABELS: Record<PrayerCode, string> = {
  fajr: "Fajr",
  sunrise: "Sunrise",
  dhuhr: "Dhuhr",
  asr: "Asr",
  maghrib: "Maghrib",
  isha: "Isha",
};

const PLATFORM_ICONS: Record<string, string> = {
  alexa: "🔵",
  google: "🔴",
  apple: "⚫",
  samsung: "🔵",
  sonos: "⚫",
};

const PLATFORM_NAMES: Record<string, string> = {
  alexa: "Alexa",
  google: "Google",
  apple: "Apple",
  samsung: "Samsung",
  sonos: "Sonos",
};

type JsonObject = Record<string, unknown>;
type PrayerMap = Partial<Record<PrayerCode, string>>;

type PrayerConfig = {
  prayerName: string;
  enabled: boolean;
  quietEnabled?: boolean;
  quietFrom?: string;
  quietTo?: string;
  adhanReciterId?: string | null;
};

type QuietHours = {
  enabled: boolean;
  from: string;
  to: string;
};

type SettingsShape = {
  city?: string;
  country?: string;
  timezone?: string;
  latitude?: number | null;
  longitude?: number | null;
  useMosqueLocation?: boolean;
  accountEnabled?: boolean;
  prayerConfigs?: PrayerConfig[];
  mosqueId?: string | null;
  mosqueName?: string | null;
  mosqueAddress?: string | null;
  mosqueCity?: string | null;
};

type TodayShape = {
  location?: {
    city?: string;
    country?: string;
    timezone?: string;
    latitude?: number | null;
    longitude?: number | null;
    label?: string;
  };
  prayers12?: PrayerMap;
  prayers24?: PrayerMap;
  enabled?: Partial<Record<PrayerCode, boolean>>;
  source?: string;
  sourceDetail?: {
    preferred?: string;
    actual?: string;
    useMosqueLocation?: boolean;
    label?: string;
    fallbackReason?: string | null;
  };
  date?: unknown;
  meta?: unknown;
};

type Device = {
  id: string;
  name: string;
  platform?: string;
};

type DashboardProps = {
  onboardingData: Record<string, unknown>;
  user?: AppUser | null;
};

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function safeReadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function normalizePrayerConfigs(value: unknown): PrayerConfig[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter((item): item is JsonObject => isObject(item))
    .map((item) => ({
      prayerName: asString(item.prayerName) ?? "",
      enabled: item.enabled !== false,
      quietEnabled:
        typeof item.quietEnabled === "boolean" ? item.quietEnabled : false,
      quietFrom: asString(item.quietFrom),
      quietTo: asString(item.quietTo),
      adhanReciterId:
        typeof item.adhanReciterId === "string" ? item.adhanReciterId : null,
    }))
    .filter((item) => !!item.prayerName);
}

function normalizeSettings(payload: unknown): SettingsShape | null {
  if (!isObject(payload)) return null;

  const root = payload;
  const src = isObject(root.settings) ? root.settings : root;

  return {
    city: asString(src.city),
    country: asString(src.country),
    timezone: asString(src.timezone),
    latitude: asNumber(src.latitude),
    longitude: asNumber(src.longitude),
    useMosqueLocation: src.useMosqueLocation === true,
    accountEnabled: src.accountEnabled === true,
    prayerConfigs: normalizePrayerConfigs(src.prayerConfigs),
    mosqueId: typeof src.mosqueId === "string" ? src.mosqueId : null,
    mosqueName: typeof src.mosqueName === "string" ? src.mosqueName : null,
    mosqueAddress:
      typeof src.mosqueAddress === "string" ? src.mosqueAddress : null,
    mosqueCity: typeof src.mosqueCity === "string" ? src.mosqueCity : null,
  };
}

function normalizeToday(payload: unknown): TodayShape | null {
  if (!isObject(payload)) return null;

  const src = payload;
  const location = isObject(src.location) ? src.location : null;

  return {
    location: location
      ? {
          city: asString(location.city),
          country: asString(location.country),
          timezone: asString(location.timezone),
          latitude: asNumber(location.latitude),
          longitude: asNumber(location.longitude),
          label: asString(location.label),
        }
      : undefined,
    prayers12: isObject(src.prayers12) ? (src.prayers12 as PrayerMap) : undefined,
    prayers24: isObject(src.prayers24) ? (src.prayers24 as PrayerMap) : undefined,
    enabled: isObject(src.enabled)
      ? (src.enabled as Partial<Record<PrayerCode, boolean>>)
      : undefined,
    source: asString(src.source),
    sourceDetail: isObject(src.sourceDetail)
      ? {
          preferred: asString(src.sourceDetail.preferred),
          actual: asString(src.sourceDetail.actual),
          useMosqueLocation:
            typeof src.sourceDetail.useMosqueLocation === "boolean"
              ? src.sourceDetail.useMosqueLocation
              : undefined,
          label: asString(src.sourceDetail.label),
          fallbackReason:
            typeof src.sourceDetail.fallbackReason === "string"
              ? src.sourceDetail.fallbackReason
              : null,
        }
      : undefined,
    date: src.date,
    meta: src.meta,
  };
}

function describeTimingSource(todayData: TodayShape | null, userSettings: SettingsShape | null) {
  const label = todayData?.sourceDetail?.label;
  if (label) return label;
  if (todayData?.source === "mosque") return "Mosque coordinates";
  if (todayData?.source === "user") return "Personal coordinates";
  if (todayData?.source === "city") return "City fallback";
  if (userSettings?.useMosqueLocation) return "Mosque preferred";
  return "Personal location";
}

function normalizeDevices(payload: unknown): Device[] {
  const list = Array.isArray(payload)
    ? payload
    : isObject(payload) && Array.isArray(payload.devices)
    ? payload.devices
    : [];

  return list
    .filter((item): item is JsonObject => isObject(item))
    .map((item) => ({
      id: typeof item.id === "string" ? item.id : "",
      name: typeof item.name === "string" ? item.name : "",
      platform: typeof item.platform === "string" ? item.platform : undefined,
    }))
    .filter((item) => item.id && item.name);
}

function parsePrayerTimeToSeconds(timeStr: string): number | null {
  const cleaned = String(timeStr || "").replace(/\s*\(.*?\)\s*$/, "").trim();

  const m24 = cleaned.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (m24) {
    const hours = Number(m24[1]);
    const minutes = Number(m24[2]);
    const seconds = m24[3] ? Number(m24[3]) : 0;

    if (
      Number.isFinite(hours) &&
      Number.isFinite(minutes) &&
      Number.isFinite(seconds) &&
      hours >= 0 &&
      hours <= 23 &&
      minutes >= 0 &&
      minutes <= 59 &&
      seconds >= 0 &&
      seconds <= 59
    ) {
      return hours * 3600 + minutes * 60 + seconds;
    }
  }

  const m12 = cleaned.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AP]M)$/i);
  if (m12) {
    let hours = Number(m12[1]);
    const minutes = Number(m12[2]);
    const seconds = m12[3] ? Number(m12[3]) : 0;
    const meridian = m12[4].toUpperCase();

    if (
      Number.isFinite(hours) &&
      Number.isFinite(minutes) &&
      Number.isFinite(seconds) &&
      hours >= 1 &&
      hours <= 12 &&
      minutes >= 0 &&
      minutes <= 59 &&
      seconds >= 0 &&
      seconds <= 59
    ) {
      if (meridian === "AM") {
        if (hours === 12) hours = 0;
      } else if (hours !== 12) {
        hours += 12;
      }

      return hours * 3600 + minutes * 60 + seconds;
    }
  }

  return null;
}

function getNowInTimeZone(timeZone: string): {
  hour: number;
  minute: number;
  second: number;
} | null {
  try {
    const formatter = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

    const parts = formatter.formatToParts(new Date());
    const getPart = (type: string) =>
      Number(parts.find((p) => p.type === type)?.value ?? NaN);

    const hour = getPart("hour");
    const minute = getPart("minute");
    const second = getPart("second");

    if ([hour, minute, second].some(Number.isNaN)) return null;

    return { hour, minute, second };
  } catch {
    return null;
  }
}

function formatDiff(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  }
  return `${minutes}m ${seconds}s`;
}

function getConnectedPlatforms(
  onboardingData: Record<string, unknown>,
  hasAmazonToken: boolean
): string[] {
  const fromOnboarding = Array.isArray(onboardingData.connectedPlatforms)
    ? onboardingData.connectedPlatforms.filter(
        (x): x is string => typeof x === "string"
      )
    : [];

  const fromLocal = safeReadJson<string[]>("adhan_connected_platforms", []);
  const merged = new Set<string>([...fromOnboarding, ...fromLocal]);

  return Array.from(merged).filter(
    (platform) => platform !== "alexa" || hasAmazonToken
  );
}

export default function Dashboard({ onboardingData, user }: DashboardProps) {
  const navigate = useNavigate();
  const [hasAmazonToken, setHasAmazonToken] = useState<boolean>(
    !!getStoredAmazonToken()
  );

  const [todayData, setTodayData] = useState<TodayShape | null>(null);
  const [loadingToday, setLoadingToday] = useState(true);
  const [todayError, setTodayError] = useState<string | null>(null);

  const [userSettings, setUserSettings] = useState<SettingsShape | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);

  const [deviceCount, setDeviceCount] = useState(0);
  const [timeToNextPrayer, setTimeToNextPrayer] = useState<string | null>(null);
  const [nextPrayerCode, setNextPrayerCode] = useState<PrayerCode | null>(null);
  const [nextPrayerTimeDisplay, setNextPrayerTimeDisplay] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    return subscribeToAmazonAuthChanges(() => {
      setHasAmazonToken(!!getStoredAmazonToken());
    });
  }, []);

  const connectedPlatforms = useMemo(
    () => getConnectedPlatforms(onboardingData, hasAmazonToken),
    [onboardingData, hasAmazonToken]
  );

  const prayersForDisplay: PrayerMap | null =
    todayData?.prayers12 || todayData?.prayers24 || null;

  const prayersForCountdown: PrayerMap | null =
    todayData?.prayers24 || todayData?.prayers12 || null;

  const activeTimeZone =
    todayData?.location?.timezone || userSettings?.timezone || "Etc/UTC";

  useEffect(() => {
    async function loadSettingsAndDevices() {
      if (!hasAmazonToken) {
        setUserSettings(null);
        setSettingsError("Please connect Amazon to load your settings.");
        setDeviceCount(0);
        return;
      }

      try {
        setSettingsError(null);

        const [settingsRes, devicesRes] = await Promise.all([
          apiFetch("/api/user/settings"),
          apiFetch("/api/alexa/devices"),
        ]);

        if (!settingsRes.ok) {
          if (settingsRes.status === 401) {
            throw new Error("Your Amazon session expired. Please reconnect Amazon.");
          }
          throw new Error(`Settings request failed (${settingsRes.status})`);
        }

        const settingsPayload = await settingsRes.json();
        setUserSettings(normalizeSettings(settingsPayload));

        if (devicesRes.ok) {
          const devicesPayload = await devicesRes.json();
          setDeviceCount(normalizeDevices(devicesPayload).length);
        } else {
          setDeviceCount(0);
        }
      } catch (err) {
        console.error("Failed to load settings/devices:", err);
        setSettingsError(
          err instanceof Error
            ? err.message
            : "Could not load your automation settings."
        );
        setUserSettings(null);
        setDeviceCount(0);
      }
    }

    void loadSettingsAndDevices();
  }, [hasAmazonToken]);

  useEffect(() => {
    async function loadToday() {
      if (!hasAmazonToken) {
        setTodayData(null);
        setTodayError("Please connect Amazon to load prayer times.");
        setLoadingToday(false);
        return;
      }

      try {
        setLoadingToday(true);
        setTodayError(null);

        const res = await apiFetch("/api/prayer-times/today");
        if (!res.ok) {
          if (res.status === 401) {
            throw new Error("Your Amazon session expired. Please reconnect Amazon.");
          }
          throw new Error(`Prayer times request failed (${res.status})`);
        }

        const data = await res.json();
        setTodayData(normalizeToday(data));
      } catch (err) {
        console.error("Failed to load prayer times:", err);
        setTodayError(
          err instanceof Error ? err.message : "Could not load prayer times."
        );
        setTodayData(null);
      } finally {
        setLoadingToday(false);
      }
    }

    void loadToday();
  }, [hasAmazonToken]);

  useEffect(() => {
    if (!prayersForCountdown) {
      setTimeToNextPrayer(null);
      setNextPrayerCode(null);
      setNextPrayerTimeDisplay(null);
      setProgress(0);
      return;
    }

    const updateCountdown = () => {
      const nowParts = getNowInTimeZone(activeTimeZone);
      if (!nowParts) {
        setTimeToNextPrayer(null);
        setNextPrayerCode(null);
        setNextPrayerTimeDisplay(null);
        setProgress(0);
        return;
      }

      const nowSeconds =
        nowParts.hour * 3600 + nowParts.minute * 60 + nowParts.second;

      const entries = COUNTDOWN_PRAYERS.map((code) => {
        const raw = prayersForCountdown[code];
        const seconds = raw ? parsePrayerTimeToSeconds(raw) : null;
        return seconds != null ? { code, seconds } : null;
      }).filter(
        (item): item is { code: PrayerCode; seconds: number } => item !== null
      );

      if (entries.length === 0) {
        setTimeToNextPrayer(null);
        setNextPrayerCode(null);
        setNextPrayerTimeDisplay(null);
        setProgress(0);
        return;
      }

      let nextIdx = entries.findIndex((entry) => entry.seconds > nowSeconds);
      let nextEntry: { code: PrayerCode; seconds: number };
      let prevEntry: { code: PrayerCode; seconds: number } | null;

      if (nextIdx === -1) {
        nextEntry = {
          ...entries[0],
          seconds: entries[0].seconds + 24 * 3600,
        };
        prevEntry = entries[entries.length - 1];
      } else {
        nextEntry = entries[nextIdx];
        prevEntry = nextIdx > 0 ? entries[nextIdx - 1] : null;

        if (!prevEntry) {
          prevEntry = {
            ...entries[entries.length - 1],
            seconds: entries[entries.length - 1].seconds - 24 * 3600,
          };
        }
      }

      const adjustedNowSeconds =
        prevEntry && prevEntry.seconds > nowSeconds
          ? nowSeconds + 24 * 3600
          : nowSeconds;

      setNextPrayerCode(nextEntry.code);
      setNextPrayerTimeDisplay(
        prayersForDisplay?.[nextEntry.code] ||
          prayersForCountdown[nextEntry.code] ||
          null
      );

      const diffMs = Math.max(0, (nextEntry.seconds - adjustedNowSeconds) * 1000);
      setTimeToNextPrayer(formatDiff(diffMs));

      if (!prevEntry) {
        setProgress(0);
        return;
      }

      const total = nextEntry.seconds - prevEntry.seconds;
      const elapsed = adjustedNowSeconds - prevEntry.seconds;
      const pct =
        total > 0
          ? Math.max(0, Math.min(100, Math.round((elapsed / total) * 100)))
          : 0;

      setProgress(pct);
    };

    updateCountdown();
    const interval = window.setInterval(updateCountdown, 1000);
    return () => window.clearInterval(interval);
  }, [prayersForCountdown, prayersForDisplay, activeTimeZone]);

  const quietHours = useMemo<QuietHours | null>(() => {
    const configs = Array.isArray(userSettings?.prayerConfigs)
      ? userSettings.prayerConfigs
      : [];

    const firstQuiet = configs.find((p) => p.quietEnabled);
    if (!firstQuiet) return null;

    return {
      enabled: true,
      from: firstQuiet.quietFrom || "22:00",
      to: firstQuiet.quietTo || "07:00",
    };
  }, [userSettings?.prayerConfigs]);

  const automationOn = !!userSettings?.accountEnabled;

  const mosque = useMemo(() => {
    if (!userSettings?.mosqueId && !userSettings?.mosqueName) return null;

    return {
      name: userSettings.mosqueName || "Selected mosque",
      address: userSettings.mosqueAddress || null,
      city: userSettings.mosqueCity || null,
    };
  }, [userSettings]);

  const locationLabel = todayData?.location?.city
    ? `${todayData.location.city}${
        todayData.location.country ? `, ${todayData.location.country}` : ""
      }`
    : userSettings?.city
    ? `${userSettings.city}${userSettings.country ? `, ${userSettings.country}` : ""}`
    : "";

  const locationCoords =
    todayData?.location?.latitude != null && todayData?.location?.longitude != null
      ? `${todayData.location.latitude.toFixed(5)}, ${todayData.location.longitude.toFixed(5)}`
      : userSettings?.latitude != null && userSettings?.longitude != null
      ? `${userSettings.latitude.toFixed(5)}, ${userSettings.longitude.toFixed(5)}`
      : null;

  const timingSourceLabel = describeTimingSource(todayData, userSettings);
  const timingFallbackReason = todayData?.sourceDetail?.fallbackReason || null;

  if (!hasAmazonToken) {
    return (
      <div className="min-h-screen bg-slate-950 py-6 px-4 md:px-8">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
            <Logo />
            <Navigation />
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8">
            <h1 className="text-white text-2xl mb-3">
              Connect Amazon to finish setup
            </h1>
            <p className="text-slate-300 mb-6">
              Your backend is live, but the dashboard needs your Amazon access
              token before it can load prayer times, settings, and device data.
            </p>
            <div className="flex gap-4 flex-wrap">
              <Button
                onClick={() => navigate("/onboarding/step2")}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                Connect Amazon
              </Button>
              <Button
                variant="outline"
                className="border-slate-700 text-slate-300"
                onClick={() => navigate("/settings")}
              >
                Open Settings
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 py-6 px-4 md:px-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
          <Logo />
          <Navigation />
        </div>

        <div className="mb-8">
          <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
            <div>
              <h1 className="text-white mb-2">
                Assalamu Alaikum, {user?.name || "User"}
              </h1>
              <p className="text-slate-400">
                Here are your prayer times for today
                {locationLabel ? ` for ${locationLabel}` : ""}.
              </p>

              {timingSourceLabel && (
                <p className="text-slate-500 text-xs mt-2">
                  Prayer source: {timingSourceLabel}
                </p>
              )}

              {timingFallbackReason && (
                <p className="text-amber-400 text-xs mt-1">
                  {timingFallbackReason}
                </p>
              )}

              {activeTimeZone && (
                <p className="text-slate-500 text-xs mt-1">
                  Timezone: {activeTimeZone}
                </p>
              )}

              {locationCoords && (
                <p className="text-slate-500 text-xs mt-1">
                  Coordinates: {locationCoords}
                </p>
              )}

              {quietHours && (
                <p className="text-slate-500 text-xs mt-1">
                  Quiet hours: {quietHours.from}–{quietHours.to}
                </p>
              )}

              {settingsError && (
                <p className="text-amber-400 text-xs mt-1">{settingsError}</p>
              )}
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              <Badge
                className={`px-3 py-1.5 ${
                  automationOn
                    ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                    : "bg-slate-700 text-slate-400 border-slate-600"
                }`}
              >
                <div
                  className={`w-2 h-2 rounded-full mr-2 ${
                    automationOn ? "bg-emerald-400" : "bg-slate-400"
                  }`}
                />
                Automation: {automationOn ? "ON" : "OFF"}
              </Badge>

              <TestAdhanButton />
            </div>
          </div>

          <p className="text-slate-500 text-sm">
            Play a sample Adhan on a linked Alexa device. If it&apos;s inside quiet
            hours, it should stay muted.
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          <div className="space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
              <h2 className="text-white mb-4">Next Prayer</h2>

              {loadingToday ? (
                <p className="text-slate-400">Loading next prayer…</p>
              ) : todayError ? (
                <p className="text-amber-400">{todayError}</p>
              ) : (
                <>
                  <p className="text-slate-400 mb-3">Next prayer in</p>
                  <div className="text-3xl text-emerald-400 font-semibold mb-2">
                    {timeToNextPrayer || "--:--"}
                  </div>
                  <div className="text-slate-300 mb-4">
                    {nextPrayerCode
                      ? `${PRAYER_LABELS[nextPrayerCode]} · ${
                          nextPrayerTimeDisplay || "--:--"
                        }`
                      : "--"}
                  </div>
                  <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 transition-all"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </>
              )}
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
              <h2 className="text-white mb-4">Today&apos;s Timetable</h2>

              {loadingToday ? (
                <p className="text-slate-400">Loading prayer times…</p>
              ) : todayError ? (
                <p className="text-amber-400 mb-4">{todayError}</p>
              ) : null}

              <div className="space-y-3">
                {PRAYER_ORDER.map((code) => (
                  <div
                    key={code}
                    className="flex items-center justify-between rounded-xl bg-slate-800/50 px-4 py-3"
                  >
                    <span className="text-white">{PRAYER_LABELS[code]}</span>
                    <span className="text-slate-300">
                      {prayersForDisplay?.[code] || "--:--"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
              <h2 className="text-white mb-4">Connected platforms</h2>

              {connectedPlatforms.length === 0 ? (
                <p className="text-slate-400 mb-4">No platform linked yet.</p>
              ) : (
                <div className="space-y-3 mb-4">
                  {connectedPlatforms.map((platform) => (
                    <div
                      key={platform}
                      className="flex items-center justify-between rounded-xl bg-slate-800/50 px-4 py-3"
                    >
                      <span className="text-white">
                        {PLATFORM_ICONS[platform] || "•"}{" "}
                        {PLATFORM_NAMES[platform] || platform}
                      </span>
                      <span className="text-emerald-400 text-sm flex items-center gap-2">
                        <CheckCircle className="w-4 h-4" /> Connected
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <p className="text-slate-400 text-sm mb-4">
                {deviceCount} linked Alexa device(s) available
              </p>

              <Button
                variant="outline"
                size="sm"
                className="w-full border-slate-700 text-slate-300 hover:bg-slate-800"
                onClick={() => navigate("/settings")}
              >
                Manage connections
              </Button>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
              <h2 className="text-white mb-4">Mosque</h2>

              {mosque ? (
                <div className="space-y-2 mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center border border-emerald-500/40">
                      <Building2 className="w-5 h-5 text-emerald-400" />
                    </div>
                    <div className="flex-1">
                      <div className="text-white mb-1">{mosque.name}</div>
                      <div className="text-slate-400 text-sm">
                        {mosque.address ||
                          mosque.city ||
                          "Using mosque location from settings"}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-slate-400 text-sm mb-4">
                  No mosque selected yet. Choose one from the{" "}
                  <Link to="/mosque" className="text-emerald-400 underline">
                    Mosque
                  </Link>{" "}
                  tab.
                </p>
              )}

              <Button
                variant="outline"
                size="sm"
                className="w-full border-slate-700 text-slate-300 hover:bg-slate-800"
                onClick={() => navigate("/mosque")}
              >
                Choose a mosque
              </Button>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
              <h2 className="text-white mb-4">Quick Actions</h2>
              <div className="space-y-3">
                <Button
                  variant="outline"
                  className="w-full justify-start border-slate-700 text-slate-300 hover:bg-slate-800"
                  onClick={() => navigate("/settings")}
                >
                  <Edit className="w-4 h-4 mr-3" />
                  Edit Prayer Settings
                </Button>

                <Button
                  variant="outline"
                  className="w-full justify-start border-slate-700 text-slate-300 hover:bg-slate-800"
                  onClick={() => navigate("/settings")}
                >
                  <SettingsIcon className="w-4 h-4 mr-3" />
                  Manage Devices & Quiet Hours
                </Button>

                <Button
                  variant="outline"
                  className="w-full justify-start border-slate-700 text-slate-300 hover:bg-slate-800"
                  onClick={() => navigate("/settings")}
                >
                  <Volume2 className="w-4 h-4 mr-3" />
                  Pause Adhan for Today
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
