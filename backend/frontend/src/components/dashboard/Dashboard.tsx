import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { AppUser } from "../../types/AppUser";
import { apiFetch, getStoredAmazonToken } from "../../lib/api";
import TestAdhanButton from "./TestAdhanButton";
import { Logo } from "../shared/Logo";
import { Navigation } from "../shared/Navigation";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import {
  Building2,
  CheckCircle,
  Edit,
  Settings,
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

const platformIcons: Record<string, string> = {
  alexa: "🔵",
  google: "🔴",
  apple: "⚫",
  samsung: "🔵",
  sonos: "⚫",
};

const platformNames: Record<string, string> = {
  alexa: "Alexa",
  google: "Google",
  apple: "Apple",
  samsung: "Samsung",
  sonos: "Sonos",
};

type DashboardProps = {
  onboardingData: Record<string, unknown>;
  user?: AppUser | null;
};

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
  accountEnabled?: boolean;
  prayerConfigs?: PrayerConfig[];
  mosqueId?: string | null;
  mosqueName?: string | null;
  mosqueAddress?: string | null;
  mosqueCity?: string | null;
};

type SettingsResponse = SettingsShape & {
  settings?: SettingsShape;
};

type TodayShape = {
  location?: {
    city?: string;
    country?: string;
    timezone?: string;
    latitude?: number | null;
    longitude?: number | null;
  };
  prayers12?: PrayerMap;
  prayers24?: PrayerMap;
  enabled?: Partial<Record<PrayerCode, boolean>>;
  source?: string;
  date?: unknown;
  meta?: unknown;
};

type Device = {
  id: string;
  name: string;
  platform?: string;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function safeReadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function normalizeSettings(payload: unknown): SettingsShape | null {
  if (!isObject(payload)) return null;

  const root = payload as SettingsResponse;
  const src = isObject(root.settings) ? root.settings : root;

  const prayerConfigs = Array.isArray(src.prayerConfigs)
    ? src.prayerConfigs
        .filter((item): item is PrayerConfig => isObject(item))
        .map((item) => ({
          prayerName:
            typeof item.prayerName === "string" ? item.prayerName : "",
          enabled: item.enabled !== false,
          quietEnabled:
            typeof item.quietEnabled === "boolean" ? item.quietEnabled : false,
          quietFrom:
            typeof item.quietFrom === "string" ? item.quietFrom : undefined,
          quietTo: typeof item.quietTo === "string" ? item.quietTo : undefined,
          adhanReciterId:
            typeof item.adhanReciterId === "string"
              ? item.adhanReciterId
              : null,
        }))
        .filter((item) => !!item.prayerName)
    : [];

  return {
    city: typeof src.city === "string" ? src.city : undefined,
    country: typeof src.country === "string" ? src.country : undefined,
    timezone: typeof src.timezone === "string" ? src.timezone : undefined,
    latitude:
      typeof src.latitude === "number" && Number.isFinite(src.latitude)
        ? src.latitude
        : null,
    longitude:
      typeof src.longitude === "number" && Number.isFinite(src.longitude)
        ? src.longitude
        : null,
    accountEnabled: src.accountEnabled === true,
    prayerConfigs,
    mosqueId: typeof src.mosqueId === "string" ? src.mosqueId : null,
    mosqueName: typeof src.mosqueName === "string" ? src.mosqueName : null,
    mosqueAddress:
      typeof src.mosqueAddress === "string" ? src.mosqueAddress : null,
    mosqueCity: typeof src.mosqueCity === "string" ? src.mosqueCity : null,
  };
}

function normalizeToday(payload: unknown): TodayShape | null {
  if (!isObject(payload)) return null;

  const src = payload as Record<string, unknown>;

  return {
    location: isObject(src.location)
      ? {
          city: typeof src.location.city === "string" ? src.location.city : undefined,
          country:
            typeof src.location.country === "string"
              ? src.location.country
              : undefined,
          timezone:
            typeof src.location.timezone === "string"
              ? src.location.timezone
              : undefined,
          latitude:
            typeof src.location.latitude === "number" &&
            Number.isFinite(src.location.latitude)
              ? src.location.latitude
              : null,
          longitude:
            typeof src.location.longitude === "number" &&
            Number.isFinite(src.location.longitude)
              ? src.location.longitude
              : null,
        }
      : undefined,
    prayers12: isObject(src.prayers12) ? (src.prayers12 as PrayerMap) : undefined,
    prayers24: isObject(src.prayers24) ? (src.prayers24 as PrayerMap) : undefined,
    enabled: isObject(src.enabled)
      ? (src.enabled as Partial<Record<PrayerCode, boolean>>)
      : undefined,
    source: typeof src.source === "string" ? src.source : undefined,
    date: src.date,
    meta: src.meta,
  };
}

function normalizeDevices(payload: unknown): Device[] {
  if (Array.isArray(payload)) {
    return payload.filter(isObject).map((item) => ({
      id: typeof item.id === "string" ? item.id : "",
      name: typeof item.name === "string" ? item.name : "",
      platform: typeof item.platform === "string" ? item.platform : undefined,
    }));
  }

  if (isObject(payload) && Array.isArray(payload.devices)) {
    return payload.devices.filter(isObject).map((item) => ({
      id: typeof item.id === "string" ? item.id : "",
      name: typeof item.name === "string" ? item.name : "",
      platform: typeof item.platform === "string" ? item.platform : undefined,
    }));
  }

  return [];
}

function parseTimeForToday(timeStr: string): Date | null {
  if (!timeStr) return null;

  const cleaned = String(timeStr).replace(/\s*\(.*?\)\s*$/, "").trim();

  const match = cleaned.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = match[3] ? Number(match[3]) : 0;

  if ([hours, minutes, seconds].some(Number.isNaN)) return null;

  const date = new Date();
  date.setHours(hours, minutes, seconds, 0);
  return date;
}

function parseDisplayTimeForToday(timeStr: string): Date | null {
  if (!timeStr) return null;

  const cleaned = String(timeStr).replace(/\s*\(.*?\)\s*$/, "").trim();

  const m12 = cleaned.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AP]M)$/i);
  if (!m12) return parseTimeForToday(cleaned);

  let h = Number(m12[1]);
  const m = Number(m12[2]);
  const s = m12[3] ? Number(m12[3]) : 0;
  const meridian = m12[4].toUpperCase();

  if (meridian === "AM") {
    if (h === 12) h = 0;
  } else if (h !== 12) {
    h += 12;
  }

  if ([h, m, s].some(Number.isNaN)) return null;

  const date = new Date();
  date.setHours(h, m, s, 0);
  return date;
}

function formatDiff(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  }

  return `${minutes}m ${seconds}s`;
}

function getConnectedPlatforms(onboardingData: Record<string, unknown>): string[] {
  const fromOnboarding = Array.isArray(onboardingData?.connectedPlatforms)
    ? onboardingData.connectedPlatforms.filter(
        (x): x is string => typeof x === "string"
      )
    : [];

  const fromLocal = safeReadJson<string[]>("adhan_connected_platforms", []);
  return Array.from(new Set([...fromOnboarding, ...fromLocal]));
}

export default function Dashboard({ onboardingData, user }: DashboardProps) {
  const navigate = useNavigate();
  const hasAmazonToken = !!getStoredAmazonToken();

  const [todayData, setTodayData] = useState<TodayShape | null>(null);
  const [loadingToday, setLoadingToday] = useState<boolean>(true);
  const [todayError, setTodayError] = useState<string | null>(null);

  const [userSettings, setUserSettings] = useState<SettingsShape | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);

  const [deviceCount, setDeviceCount] = useState<number>(0);
  const [timeToNextPrayer, setTimeToNextPrayer] = useState<string | null>(null);
  const [nextPrayerCode, setNextPrayerCode] = useState<PrayerCode | null>(null);
  const [nextPrayerTimeDisplay, setNextPrayerTimeDisplay] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  const connectedPlatforms = useMemo(
    () => getConnectedPlatforms(onboardingData),
    [onboardingData]
  );

  const prayersForDisplay: PrayerMap | null =
    todayData?.prayers12 || todayData?.prayers24 || null;
  const prayersForCountdown: PrayerMap | null =
    todayData?.prayers24 || todayData?.prayers12 || null;

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
          throw new Error(`Settings request failed (${settingsRes.status})`);
        }

        const settingsPayload = await settingsRes.json();
        setUserSettings(normalizeSettings(settingsPayload));

        if (devicesRes.ok) {
          const devicesPayload = await devicesRes.json();
          const list = normalizeDevices(devicesPayload).filter(
            (d) => d.id && d.name
          );
          setDeviceCount(list.length);
        } else {
          setDeviceCount(0);
        }
      } catch (err) {
        console.error("Failed to load user settings:", err);
        setSettingsError("Could not load your automation settings.");
        setUserSettings(null);
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
          throw new Error(`Prayer times request failed (${res.status})`);
        }

        const data = await res.json();
        setTodayData(normalizeToday(data));
      } catch (err) {
        console.error("Failed to load today prayer times:", err);
        setTodayError("Could not load prayer times.");
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
      const now = new Date();

      const entries = COUNTDOWN_PRAYERS.map((code) => {
        const raw = prayersForCountdown[code];
        const date = raw ? parseTimeForToday(raw) || parseDisplayTimeForToday(raw) : null;
        return date ? { code, time: date } : null;
      }).filter(
        (item): item is { code: PrayerCode; time: Date } => item !== null
      );

      if (entries.length === 0) {
        setTimeToNextPrayer(null);
        setNextPrayerCode(null);
        setNextPrayerTimeDisplay(null);
        setProgress(0);
        return;
      }

      let nextIdx = entries.findIndex((entry) => entry.time > now);
      let nextEntry: { code: PrayerCode; time: Date };
      let prevEntry: { code: PrayerCode; time: Date } | null;

      if (nextIdx === -1) {
        nextEntry = {
          ...entries[0],
          time: new Date(entries[0].time.getTime() + 24 * 60 * 60 * 1000),
        };
        prevEntry = entries[entries.length - 1];
      } else {
        nextEntry = entries[nextIdx];
        prevEntry = nextIdx > 0 ? entries[nextIdx - 1] : null;
      }

      setNextPrayerCode(nextEntry.code);
      setNextPrayerTimeDisplay(
        prayersForDisplay?.[nextEntry.code] ||
          prayersForCountdown[nextEntry.code] ||
          null
      );
      setTimeToNextPrayer(formatDiff(nextEntry.time.getTime() - now.getTime()));

      if (!prevEntry) {
        setProgress(0);
        return;
      }

      const total = nextEntry.time.getTime() - prevEntry.time.getTime();
      const elapsed = now.getTime() - prevEntry.time.getTime();
      const pct =
        total > 0
          ? Math.max(0, Math.min(100, Math.round((elapsed / total) * 100)))
          : 0;
      setProgress(pct);
    };

    updateCountdown();
    const interval = window.setInterval(updateCountdown, 1000);
    return () => window.clearInterval(interval);
  }, [prayersForCountdown, prayersForDisplay]);

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

  const locationLabel =
    todayData?.location?.city
      ? `${todayData.location.city}${
          todayData.location.country ? `, ${todayData.location.country}` : ""
        }`
      : userSettings?.city
      ? `${userSettings.city}${
          userSettings.country ? `, ${userSettings.country}` : ""
        }`
      : "";

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

              {todayData?.source && (
                <p className="text-slate-500 text-xs mt-2">
                  Prayer source: {todayData.source}
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
            Play a sample Adhan on your selected device. If it&apos;s within your
            quiet hours, it should stay muted.
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
                        {platformIcons[platform] || "•"}{" "}
                        {platformNames[platform] || platform}
                      </span>
                      <span className="text-emerald-400 text-sm flex items-center gap-2">
                        <CheckCircle className="w-4 h-4" /> Connected
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <p className="text-slate-400 text-sm mb-4">
                {deviceCount} device(s) active for Adhan
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
                  <Edit className="w-4 h-4 mr-3" /> Edit Prayer Settings
                </Button>

                <Button
                  variant="outline"
                  className="w-full justify-start border-slate-700 text-slate-300 hover:bg-slate-800"
                  onClick={() => navigate("/settings")}
                >
                  <Settings className="w-4 h-4 mr-3" /> Manage Devices & Quiet
                  Hours
                </Button>

                <Button
                  variant="outline"
                  className="w-full justify-start border-slate-700 text-slate-300 hover:bg-slate-800"
                  onClick={() => navigate("/settings")}
                >
                  <Volume2 className="w-4 h-4 mr-3" /> Pause Adhan for Today
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}