import { useEffect, useMemo, useState } from "react";
import { schedulePrayerNotifications } from "../../lib/pushNotifications";
import { cacheToday, readToday } from "../../lib/prayerCache";
import { prefetchUpcomingMonths } from "../../lib/prayerPrefetch";
import { cacheValue, readValue } from "../../lib/offlineCache";
import { t, getCurrentLang } from "../../lib/i18n";
import { useNavigate } from "react-router-dom";
import type { AppUser } from "../../types/AppUser";
import {
  apiFetch,
  getStoredAmazonToken,
  subscribeToAmazonAuthChanges,
} from "../../lib/api";
import { Logo } from "../shared/Logo";
import { Navigation } from "../shared/Navigation";
import { Button } from "../ui/button";
import {
  Building2,
  CheckCircle,
  MoonStar,
  MapPin,
  Clock3,
  BookOpen,
  Clock,
  Calendar as CalendarIcon,
  Wifi,
  WifiOff,
  AlertCircle,
  Volume2,
  Sunrise,
  Sun,
  Sunset,
  Star,
  ChevronRight,
  Settings2,
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
 
const PRAYER_ICONS: Record<PrayerCode, React.ReactNode> = {
  fajr: <MoonStar className="w-5 h-5" />,
  sunrise: <Sunrise className="w-5 h-5" />,
  dhuhr: <Sun className="w-5 h-5" />,
  asr: <Sun className="w-5 h-5" />,
  maghrib: <Sunset className="w-5 h-5" />,
  isha: <Star className="w-5 h-5" />,
};
 
const PRAYER_COLORS: Record<PrayerCode, { icon: string; glow: string; bg: string; border: string; time: string }> = {
  fajr:    { icon: "text-indigo-300",  glow: "shadow-indigo-500/20",  bg: "bg-indigo-500/10",  border: "border-indigo-500/30",  time: "text-indigo-200" },
  sunrise: { icon: "text-amber-300",   glow: "shadow-amber-500/20",   bg: "bg-amber-500/10",   border: "border-amber-500/30",   time: "text-amber-200"  },
  dhuhr:   { icon: "text-yellow-300",  glow: "shadow-yellow-500/20",  bg: "bg-yellow-500/10",  border: "border-yellow-500/30",  time: "text-yellow-200" },
  asr:     { icon: "text-orange-300",  glow: "shadow-orange-500/20",  bg: "bg-orange-500/10",  border: "border-orange-500/30",  time: "text-orange-200" },
  maghrib: { icon: "text-rose-300",    glow: "shadow-rose-500/20",    bg: "bg-rose-500/10",    border: "border-rose-500/30",    time: "text-rose-200"   },
  isha:    { icon: "text-violet-300",  glow: "shadow-violet-500/20",  bg: "bg-violet-500/10",  border: "border-violet-500/30",  time: "text-violet-200" },
};
 
const PLATFORM_COLORS: Record<string, string> = {
  alexa:   "bg-cyan-500/15 border-cyan-500/30 text-cyan-300",
  google:  "bg-red-500/15 border-red-500/30 text-red-300",
  apple:   "bg-slate-500/15 border-slate-500/30 text-slate-300",
  samsung: "bg-blue-500/15 border-blue-500/30 text-blue-300",
  sonos:   "bg-slate-500/15 border-slate-500/30 text-slate-300",
};
 
const PLATFORM_NAMES: Record<string, string> = {
  alexa: "Alexa",
  google: "Google",
  apple: "Apple",
  samsung: "Samsung",
  sonos: "Sonos",
};
 
const PLATFORM_INITIALS: Record<string, string> = {
  alexa: "A",
  google: "G",
  apple: "",
  samsung: "S",
  sonos: "S",
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
  sect?: string;
  madhhab?: string;
  calculationMethod?: string;
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
  method?: {
    sect?: string;
    calculationMethod?: string;
    madhhab?: string;
  };
  date?: unknown;
  meta?: unknown;
};
 
type Device = {
  id: string;
  name: string;
  platform?: string;
};
 
type HadithShape = {
  id: string;
  sect: "SUNNI" | "SHIA";
  title: string;
  reference: string;
  narrator?: string | null;
  textEnglish: string;
  textArabic?: string | null;
  source?: string | null;
  dateKey?: string;
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
      quietEnabled: typeof item.quietEnabled === "boolean" ? item.quietEnabled : false,
      quietFrom: asString(item.quietFrom),
      quietTo: asString(item.quietTo),
      adhanReciterId: typeof item.adhanReciterId === "string" ? item.adhanReciterId : null,
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
    mosqueAddress: typeof src.mosqueAddress === "string" ? src.mosqueAddress : null,
    mosqueCity: typeof src.mosqueCity === "string" ? src.mosqueCity : null,
    sect: asString(src.sect) ?? "SUNNI",
    madhhab: asString(src.madhhab) ?? "hanafi",
    calculationMethod: asString(src.calculationMethod) ?? "isna",
  };
}
 
function normalizeToday(payload: unknown): TodayShape | null {
  if (!isObject(payload)) return null;
  const src = payload;
  const location = isObject(src.location) ? src.location : null;
  const method = isObject(src.method) ? src.method : null;
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
    method: method
      ? {
          sect: asString(method.sect),
          calculationMethod: asString(method.calculationMethod),
          madhhab: asString(method.madhhab),
        }
      : undefined,
    date: src.date,
    meta: src.meta,
  };
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
 
function normalizeHadith(payload: unknown): HadithShape | null {
  if (!isObject(payload)) return null;
  const sect =
    String(payload.sect || "").trim().toUpperCase() === "SHIA" ? "SHIA" : "SUNNI";
  const textEnglish =
    asString(payload.textEnglish) || asString(payload.text) || undefined;
  if (!textEnglish) return null;
  return {
    id: asString(payload.id) || `${sect.toLowerCase()}-hadith`,
    sect,
    title: asString(payload.title) || "Hadith of the Day",
    reference: asString(payload.reference) || "Reference unavailable",
    narrator: asString(payload.narrator) || null,
    textEnglish,
    textArabic: asString(payload.textArabic) || null,
    source: asString(payload.source) || null,
    dateKey: asString(payload.dateKey),
  };
}
 
function parsePrayerTimeToSeconds(timeStr: string): number | null {
  const cleaned = String(timeStr || "").replace(/\s*\(.*?\)\s*$/, "").trim();
  const m24 = cleaned.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (m24) {
    const hours = Number(m24[1]);
    const minutes = Number(m24[2]);
    const seconds = m24[3] ? Number(m24[3]) : 0;
    if (
      Number.isFinite(hours) && Number.isFinite(minutes) && Number.isFinite(seconds) &&
      hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59 && seconds >= 0 && seconds <= 59
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
    if (hours >= 1 && hours <= 12) {
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
 
function getNowInTimeZone(timeZone: string) {
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
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
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
 
function titleCase(value?: string | null) {
  return (
    String(value || "")
      .replace(/([A-Z])/g, " $1")
      .replace(/[_-]+/g, " ")
      .trim()
      .toLowerCase()
      .replace(/\b\w/g, (c) => c.toUpperCase()) || "—"
  );
}
 
function describeTimingSource(
  todayData: TodayShape | null,
  userSettings: SettingsShape | null
) {
  const label = todayData?.sourceDetail?.label;
  if (label) return label;
  if (todayData?.source === "mosque") return "Mosque coordinates";
  if (todayData?.source === "personal") return "Personal coordinates";
  if (todayData?.source === "city") return "City fallback";
  if (userSettings?.useMosqueLocation) return "Mosque preferred";
  return "Personal location";
}
 
export default function Dashboard({ onboardingData, user }: DashboardProps) {
  const navigate = useNavigate();
 
  const [hasAmazonToken, setHasAmazonToken] = useState<boolean>(
    !!getStoredAmazonToken()
  );
  const [hadithOfDay, setHadithOfDay] = useState<HadithShape | null>(null);
  const [loadingHadith, setLoadingHadith] = useState(true);
  const [hadithError, setHadithError] = useState<string | null>(null);
 
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
  const [currentTime, setCurrentTime] = useState(new Date());
 
  useEffect(() => {
    return subscribeToAmazonAuthChanges(() => {
      setHasAmazonToken(!!getStoredAmazonToken());
    });
  }, []);
 
  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(new Date()), 1000);
    return () => window.clearInterval(timer);
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
 
  // ── Settings + Devices ──────────────────────────────────────────────────
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
          if (settingsRes.status === 401)
            throw new Error("Your Amazon session expired. Please reconnect Amazon.");
          throw new Error(`Settings request failed (${settingsRes.status})`);
        }
        const settingsPayload = await settingsRes.json();
        cacheValue("settings", settingsPayload); // for offline display
        setUserSettings(normalizeSettings(settingsPayload));
        if (devicesRes.ok) {
          const devicesPayload = await devicesRes.json();
          setDeviceCount(normalizeDevices(devicesPayload).length);
        } else {
          setDeviceCount(0);
        }
      } catch (err) {
        console.error("Failed to load settings/devices:", err);
        // Offline → fall back to last cached settings so location/method/quiet
        // hours still render instead of an error.
        const cached = readValue<unknown>("settings");
        if (cached) {
          setUserSettings(normalizeSettings(cached));
          setSettingsError(null);
          setDeviceCount(0);
        } else {
          setSettingsError(
            err instanceof Error ? err.message : "Could not load your automation settings."
          );
          setUserSettings(null);
          setDeviceCount(0);
        }
      }
    }
    void loadSettingsAndDevices();
  }, [hasAmazonToken]);
 
  // ── Prayer Times ────────────────────────────────────────────────────────
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
          if (res.status === 401)
            throw new Error("Your Amazon session expired. Please reconnect Amazon.");
          throw new Error(`Prayer times request failed (${res.status})`);
        }
        const data = await res.json();
        cacheToday(data); // store the authoritative server response for offline use
        setTodayData(normalizeToday(data));
        // Schedule local notifications for all prayer times
        void schedulePrayerNotifications();
      } catch (err) {
        console.error("Failed to load prayer times:", err);
        // Offline or request failed → fall back to the last cached times for today
        const cached = readToday<unknown>();
        if (cached) {
          setTodayData(normalizeToday(cached));
          setTodayError(null);
          void schedulePrayerNotifications();
        } else {
          setTodayError(
            err instanceof Error ? err.message : "Could not load prayer times."
          );
          setTodayData(null);
        }
      } finally {
        setLoadingToday(false);
      }
    }
    void loadToday();
  }, [hasAmazonToken]);
 
  // Background: cache current + next month while online for ~60 days of
  // exact offline coverage (calendar + forward-dated logic).
  useEffect(() => {
    if (hasAmazonToken) {
      void prefetchUpcomingMonths();
    }
  }, [hasAmazonToken]);
 
  // ── Countdown ───────────────────────────────────────────────────────────
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
 
      const nowSeconds = nowParts.hour * 3600 + nowParts.minute * 60 + nowParts.second;
      const entries = COUNTDOWN_PRAYERS.map((code) => {
        const raw = prayersForCountdown[code];
        const seconds = raw ? parsePrayerTimeToSeconds(raw) : null;
        return seconds != null ? { code, seconds } : null;
      }).filter((item): item is { code: PrayerCode; seconds: number } => item !== null);
 
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
        nextEntry = { ...entries[0], seconds: entries[0].seconds + 24 * 3600 };
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
 
  // ── Derived values ──────────────────────────────────────────────────────
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
  const lang = getCurrentLang();
  // Native Intl Islamic (Umm al-Qura) calendar — renders "… 1448 AH" correctly.
  // Avoids the toHijri() helper in i18n.ts which appends a wrong "BC" era suffix.
  const hijriDate = useMemo(() => {
    try {
      return new Intl.DateTimeFormat("en-u-ca-islamic-umalqura", {
        day: "numeric",
        month: "long",
        year: "numeric",
      }).format(new Date());
    } catch {
      return null;
    }
  }, []);
 
  const mosque = useMemo(() => {
    if (!userSettings?.mosqueId && !userSettings?.mosqueName) return null;
    return {
      name: userSettings.mosqueName || "Selected mosque",
      address: userSettings.mosqueAddress || null,
      city: userSettings.mosqueCity || null,
    };
  }, [userSettings]);
 
  const locationLabel = todayData?.location?.label
    ? todayData.location.label
    : todayData?.location?.city
    ? `${todayData.location.city}${todayData.location.country ? `, ${todayData.location.country}` : ""}`
    : userSettings?.city
    ? `${userSettings.city}${userSettings.country ? `, ${userSettings.country}` : ""}`
    : "";
 
  const timingSourceLabel = describeTimingSource(todayData, userSettings);
  const timingFallbackReason = todayData?.sourceDetail?.fallbackReason || null;
 
  const locationCoords =
    todayData?.location?.latitude != null && todayData?.location?.longitude != null
      ? `${todayData.location.latitude.toFixed(5)}, ${todayData.location.longitude.toFixed(5)}`
      : userSettings?.latitude != null && userSettings?.longitude != null
      ? `${userSettings.latitude.toFixed(5)}, ${userSettings.longitude.toFixed(5)}`
      : null;
 
  const effectiveSect = String(
    todayData?.method?.sect || userSettings?.sect || "SUNNI"
  ).toUpperCase();
  const sectLabel = titleCase(effectiveSect);
  const madhhabLabel =
    effectiveSect === "SHIA"
      ? "Shia timing mode"
      : titleCase(todayData?.method?.madhhab || userSettings?.madhhab || "hanafi");
  const calcLabel = titleCase(
    todayData?.method?.calculationMethod ||
      userSettings?.calculationMethod ||
      (effectiveSect === "SHIA" ? "jafari" : "isna")
  );
 
  const hadithSect: "SUNNI" | "SHIA" =
    String(todayData?.method?.sect || userSettings?.sect || "SUNNI").toUpperCase() === "SHIA"
      ? "SHIA"
      : "SUNNI";
 
  // ── Hadith ──────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    async function loadHadith() {
      if (!hasAmazonToken) {
        setHadithOfDay(null);
        setHadithError("Please connect Amazon to load the daily hadith.");
        setLoadingHadith(false);
        return;
      }
      try {
        setLoadingHadith(true);
        setHadithError(null);
        const res = await apiFetch(
          `/api/hadith-of-day?sect=${encodeURIComponent(hadithSect)}`
        );
        if (!res.ok) {
          if (res.status === 401)
            throw new Error("Your Amazon session expired. Please reconnect Amazon.");
          throw new Error(`Hadith request failed (${res.status})`);
        }
        const raw = await res.json();
        const payload = normalizeHadith(raw);
        if (!payload) throw new Error("Invalid hadith payload.");
        cacheValue(`hadith_${hadithSect}`, raw); // for offline display
        if (!cancelled) setHadithOfDay(payload);
      } catch (err) {
        console.error("Failed to load hadith of the day:", err);
        // Offline → show the last cached hadith for this sect instead of an error.
        const cached = readValue<unknown>(`hadith_${hadithSect}`);
        const cachedPayload = cached ? normalizeHadith(cached) : null;
        if (!cancelled) {
          if (cachedPayload) {
            setHadithOfDay(cachedPayload);
            setHadithError(null);
          } else {
            setHadithOfDay(null);
            setHadithError(
              err instanceof Error ? err.message : "Could not load hadith of the day."
            );
          }
        }
      } finally {
        if (!cancelled) setLoadingHadith(false);
      }
    }
    void loadHadith();
    return () => { cancelled = true; };
  }, [hasAmazonToken, hadithSect]);
 
  const gregorianDate = currentTime.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
 
  const formattedTime = currentTime.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
 
  async function handleToggleAutomation() {
    if (!hasAmazonToken) {
      navigate("/settings");
      return;
    }
    const newEnabled = !automationOn;
    try {
      const res = await apiFetch("/api/user/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountEnabled: newEnabled }),
      });
      if (!res.ok) throw new Error(`Failed to update automation (${res.status})`);
      const updatedPayload = await res.json();
      setUserSettings(normalizeSettings(updatedPayload));
      // Also update reminder status in backend
      await apiFetch("/api/alexa/skill/automation/enable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: newEnabled }),
      }).catch(() => {}); // Non-fatal
    } catch (err) {
      console.error("Failed to toggle automation:", err);
      alert(err instanceof Error ? err.message : "Could not update automation setting.");
    }
  }
 
  const nextColors = nextPrayerCode ? PRAYER_COLORS[nextPrayerCode] : PRAYER_COLORS.fajr;
 
  const SKY_GRADIENTS: Record<string, string> = {
    fajr:    "linear-gradient(165deg,#020212 0%,#0c0a2e 35%,#1e1250 70%,#2d1060 100%)",
    sunrise: "linear-gradient(165deg,#0f0520 0%,#2d1a6e 30%,#7b3f6e 60%,#c47a3a 100%)",
    dhuhr:   "linear-gradient(165deg,#061828 0%,#0b3060 35%,#0e5ea0 70%,#1a8acc 100%)",
    asr:     "linear-gradient(165deg,#061018 0%,#082535 35%,#0a4535 65%,#a06018 100%)",
    maghrib: "linear-gradient(165deg,#0a0215 0%,#3d0828 30%,#9a3520 60%,#c87010 100%)",
    isha:    "linear-gradient(165deg,#020308 0%,#06081c 35%,#0e0628 70%,#1e0845 100%)",
  };
  const skyGradient =
    SKY_GRADIENTS[nextPrayerCode ?? ""] ??
    "linear-gradient(165deg,#080810 0%,#0d0d28 50%,#151530 100%)";
 
  const ARC_COLORS: Record<string, [string, string]> = {
    fajr:    ["#818cf8", "#a78bfa"],
    sunrise: ["#fbbf24", "#f97316"],
    dhuhr:   ["#38bdf8", "#818cf8"],
    asr:     ["#86efac", "#fde68a"],
    maghrib: ["#f87171", "#fb923c"],
    isha:    ["#c084fc", "#818cf8"],
  };
 
  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-950 overscroll-none">
      {/* Scoped grid CSS — guarantees the prayer row renders as columns
          regardless of whether Tailwind's grid-cols-* utilities are generated. */}
      <style>{`
        .adhan-prayer-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 0.75rem;
        }
        @media (min-width: 640px) {
          .adhan-prayer-grid { grid-template-columns: repeat(6, minmax(0, 1fr)); }
        }
      `}</style>
 
      {/* Ambient background glow */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-emerald-500/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-teal-500/5 rounded-full blur-3xl" />
      </div>
 
      {/* Sticky Header */}
      <div
        className="sticky top-0 z-20 bg-slate-950/90 backdrop-blur-md border-b border-white/5"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <div className="max-w-7xl mx-auto px-4 py-3 md:px-6">
          <div className="flex items-center justify-between gap-4">
            <Logo />
            <Navigation />
          </div>
        </div>
      </div>
 
      <div
        className="relative max-w-7xl mx-auto px-4 py-6 space-y-5 md:px-6 md:py-8 md:space-y-6"
        style={{ paddingBottom: "calc(1.5rem + env(safe-area-inset-bottom))" }}
      >
 
        {/* ── Activation banner ── */}
        {onboardingData.activationPhrase && !automationOn && (
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-5 py-4">
            <div className="flex items-start gap-3">
              <Volume2 className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <div className="text-amber-200 font-semibold text-sm mb-1">
                  One step to activate automatic Adhan
                </div>
                <p className="text-amber-300/80 text-xs leading-relaxed mb-2">
                  Say this on any Echo device to schedule your daily Adhan reminders:
                </p>
                <div className="rounded-xl bg-slate-900/60 border border-amber-500/20 px-4 py-2.5 font-mono text-sm text-white select-all">
                  "Alexa, open {String(onboardingData.activationPhrase)}"
                </div>
              </div>
            </div>
          </div>
        )}
 
        {/* ── Top status strip ── */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <MapPin className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-slate-300 text-sm">{locationLabel || "Location not set"}</span>
          </div>
          <div className="flex items-center gap-2">
            <div
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs border transition-colors ${
                automationOn
                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                  : "bg-slate-800/80 text-slate-400 border-slate-700/50"
              }`}
            >
              {automationOn ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
              {automationOn ? t(lang, "dashboard.automationActive") : t(lang, "dashboard.automationPaused")}
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs border bg-slate-800/80 text-slate-400 border-slate-700/50">
              <CheckCircle className="w-3 h-3" />
              {deviceCount} {deviceCount === 1 ? "Device" : "Devices"}
            </div>
          </div>
        </div>
 
        {/* ── HERO: Next Prayer ── */}
        <div className="relative overflow-hidden rounded-3xl border border-white/8 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950">
          {/* Glow orbs */}
          <div className="absolute -top-20 -right-20 w-72 h-72 bg-emerald-500/10 rounded-full blur-3xl" />
          <div className="absolute -bottom-12 -left-12 w-56 h-56 bg-teal-500/8 rounded-full blur-3xl" />
          {/* Top accent line */}
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-emerald-500/40 to-transparent" />
 
          <div className="relative z-10 overflow-hidden">
 
            {/* Prayer-aware sky gradient */}
            <div
              className="absolute inset-0 pointer-events-none transition-all duration-[2000ms]"
              style={{ background: skyGradient, opacity: 0.6 }}
            />
 
            {/* Stars */}
            <svg
              className="absolute inset-0 w-full h-full pointer-events-none select-none"
              xmlns="http://www.w3.org/2000/svg"
            >
              {([
                [7,8],[14,5],[22,14],[30,4],[38,11],[46,7],[54,17],[62,5],[70,12],[78,4],
                [86,16],[92,9],[97,5],[3,22],[17,26],[33,20],[50,28],[66,19],[82,25],[94,21],
                [11,33],[25,36],[42,31],[58,38],[74,32],[88,36],[10,44],[28,42],[45,48],[63,43],
              ] as [number,number][]).map(([x, y], i) => (
                <circle
                  key={i}
                  cx={`${x}%`}
                  cy={`${y}%`}
                  r={i % 4 === 0 ? 1.5 : i % 3 === 0 ? 1.2 : 0.9}
                  fill="white"
                  opacity={0.15 + (i % 6) * 0.08}
                />
              ))}
            </svg>
 
            {/* Mosque skyline silhouette */}
            <div className="absolute bottom-0 left-0 right-0 pointer-events-none select-none">
              <svg
                viewBox="0 0 1440 170"
                xmlns="http://www.w3.org/2000/svg"
                className="w-full"
                preserveAspectRatio="xMidYMax meet"
              >
                <g fill="rgb(2 6 23 / 0.72)">
                  <rect x="0"   y="128" width="38" height="42"/>
                  <rect x="14"  y="112" width="30" height="58"/>
                  <rect x="48"  y="120" width="24" height="50"/>
                  <rect x="75"  y="130" width="18" height="40"/>
                  <rect x="102" y="55"  width="16" height="115"/>
                  <polygon points="102,55 110,30 118,55"/>
                  <rect x="122" y="95"  width="155" height="75"/>
                  <path d="M 138 95 Q 178 58 218 95 Z"/>
                  <rect x="280" y="38"  width="18" height="132"/>
                  <polygon points="280,38 289,14 298,38"/>
                  <rect x="300" y="100" width="540" height="70"/>
                  <path d="M 322 100 C 375 100 418 68 474 46 C 528 24 572 16 570 15 Q 620 10 660 15 C 668 16 712 24 766 46 C 822 68 865 100 918 100 Z"/>
                  <rect x="617" y="5"   width="6"  height="14" rx="2"/>
                  <circle cx="620" cy="4" r="3"/>
                  <rect x="842" y="38"  width="18" height="132"/>
                  <polygon points="842,38 851,14 860,38"/>
                  <rect x="863" y="95"  width="155" height="75"/>
                  <path d="M 880 95 Q 920 58 960 95 Z"/>
                  <rect x="1022" y="55" width="16" height="115"/>
                  <polygon points="1022,55 1030,30 1038,55"/>
                  <rect x="1042" y="130" width="18" height="40"/>
                  <rect x="1064" y="120" width="24" height="50"/>
                  <rect x="1095" y="112" width="30" height="58"/>
                  <rect x="1132" y="125" width="42" height="45"/>
                  <rect x="1183" y="115" width="52" height="55"/>
                  <rect x="1248" y="122" width="68" height="48"/>
                  <rect x="1328" y="110" width="54" height="60"/>
                  <rect x="1392" y="118" width="48" height="52"/>
                  <rect x="0"   y="155" width="1440" height="15"/>
                </g>
              </svg>
            </div>
 
            {/* Hero content */}
            <div className="relative p-6 md:p-10 pb-20 md:pb-20">
 
              {/* Date + method row */}
              <div className="flex items-start justify-between gap-4 flex-wrap mb-8">
                <div>
                  <p className="text-emerald-300/70 text-xs tracking-widest uppercase mb-1">
                    Assalamu Alaikum
                  </p>
                  <p className="text-white/90 text-sm">{gregorianDate}</p>
                  {hijriDate && (
                    <p className="text-white/40 text-xs mt-0.5">{hijriDate}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-2.5 py-1 rounded-full text-xs bg-cyan-400/10 text-cyan-300 border border-cyan-400/20">
                    {sectLabel}
                  </span>
                  <span className="px-2.5 py-1 rounded-full text-xs bg-white/8 text-white/55 border border-white/10">
                    {madhhabLabel}
                  </span>
                  <span className="px-2.5 py-1 rounded-full text-xs bg-white/8 text-white/55 border border-white/10">
                    {calcLabel}
                  </span>
                </div>
              </div>
 
              {/* Main grid: arc+countdown left, clock+source+button right */}
              <div className="grid md:grid-cols-5 gap-6 md:gap-8 items-start">
 
                {/* Left: arc + countdown */}
                <div className="md:col-span-3">
                  {loadingToday ? (
                    <div className="space-y-4">
                      <div className="text-white/30 text-sm">Loading prayer times…</div>
                      <div className="text-6xl text-white/15 tabular-nums">--:--:--</div>
                    </div>
                  ) : todayError ? (
                    <div className="flex items-start gap-3 p-4 rounded-2xl bg-amber-500/5 border border-amber-500/20">
                      <AlertCircle className="w-5 h-5 text-amber-400 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-amber-300 text-sm">Could not load prayer times</p>
                        <p className="text-amber-200/70 text-sm mt-1">{todayError}</p>
                      </div>
                    </div>
                  ) : (
                    <div>
                      {/* Radial arc progress */}
                      {(() => {
                        const cx = 160, cy = 148, r = 122;
                        const pct = Math.max(0, Math.min(100, progress));
                        const angle = Math.PI * (1 - pct / 100);
                        const dotX = cx + r * Math.cos(angle);
                        const dotY = cy - r * Math.sin(angle);
                        const trackPath = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`;
                        const progPath = pct > 0
                          ? `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${dotX.toFixed(2)} ${dotY.toFixed(2)}`
                          : "";
                        const [c1, c2]: [string, string] =
                          ARC_COLORS[nextPrayerCode ?? ""] ?? ["#34d399", "#14b8a6"];
                        const ticks = [0, 25, 50, 75, 100].map(p => {
                          const a = Math.PI * (1 - p / 100);
                          return { x: cx + r * Math.cos(a), y: cy - r * Math.sin(a) };
                        });
                        return (
                          <div className="relative w-full max-w-xs mx-auto md:mx-0 -mb-4">
                            <svg viewBox="0 0 320 165" className="w-full" xmlns="http://www.w3.org/2000/svg">
                              <defs>
                                <linearGradient id="arcFill" x1="0%" y1="0%" x2="100%" y2="0%">
                                  <stop offset="0%" stopColor={c1}/>
                                  <stop offset="100%" stopColor={c2}/>
                                </linearGradient>
                                <filter id="glowDot" x="-80%" y="-80%" width="260%" height="260%">
                                  <feGaussianBlur stdDeviation="5" result="blur"/>
                                  <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
                                </filter>
                                <filter id="glowArc" x="-10%" y="-40%" width="120%" height="180%">
                                  <feGaussianBlur stdDeviation="2.5" result="blur"/>
                                  <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
                                </filter>
                              </defs>
                              {pct > 0 && (
                                <path d={progPath} fill="none" stroke={c1} strokeWidth="10"
                                  strokeLinecap="round" opacity="0.12"/>
                              )}
                              <path d={trackPath} fill="none" stroke="rgba(255,255,255,0.07)"
                                strokeWidth="3" strokeLinecap="round"/>
                              {pct > 0 && (
                                <path d={progPath} fill="none" stroke="url(#arcFill)"
                                  strokeWidth="3.5" strokeLinecap="round" filter="url(#glowArc)"/>
                              )}
                              {ticks.map((tick, i) => (
                                <circle key={i} cx={tick.x} cy={tick.y} r="2.5"
                                  fill="rgba(255,255,255,0.18)"/>
                              ))}
                              <circle cx={cx - r} cy={cy} r="4" fill="rgba(255,255,255,0.12)"/>
                              <circle cx={cx + r} cy={cy} r="4" fill="rgba(255,255,255,0.08)"/>
                              <circle cx={dotX} cy={dotY} r="16" fill={c1} opacity="0.18"
                                filter="url(#glowDot)"/>
                              <circle cx={dotX} cy={dotY} r="10" fill="white" opacity="0.85"/>
                              <circle cx={dotX} cy={dotY} r="5.5" fill={c1}/>
                              <circle cx={dotX - 1.5} cy={dotY - 1.5} r="2" fill="white" opacity="0.5"/>
                            </svg>
                          </div>
                        );
                      })()}
 
                      {/* Countdown text */}
                      <div className="text-center md:text-left">
                        <p className="text-white/35 text-[10px] tracking-[0.2em] uppercase mb-2">
                          Time Remaining
                        </p>
                        <div
                          className="text-5xl md:text-6xl text-white tabular-nums tracking-tight mb-5"
                          style={{ textShadow: "0 0 40px rgba(255,255,255,0.15)" }}
                        >
                          {timeToNextPrayer || "--:--:--"}
                        </div>
 
                        {/* Prayer name pill + time */}
                        <div className="flex items-center gap-3 flex-wrap">
                          <div
                            className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl border ${nextColors.bg} ${nextColors.border}`}
                            style={{ backdropFilter: "blur(8px)" }}
                          >
                            <span className={nextColors.icon}>
                              {nextPrayerCode ? PRAYER_ICONS[nextPrayerCode] : <MoonStar className="w-5 h-5" />}
                            </span>
                            <span className={`text-lg ${nextColors.icon}`}>
                              {nextPrayerCode ? PRAYER_LABELS[nextPrayerCode] : "—"}
                            </span>
                          </div>
                          <span className="text-2xl text-white/65 tabular-nums">
                            {nextPrayerTimeDisplay || "--:--"}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
 
                {/* Right: clock + source + button */}
                <div className="md:col-span-2 flex flex-col gap-3">
                  <div
                    className="p-5 rounded-2xl border border-white/8 space-y-3"
                    style={{ background: "rgba(0,0,0,0.25)", backdropFilter: "blur(12px)" }}
                  >
                    <div className="flex items-center gap-2 text-white/35 text-xs uppercase tracking-widest">
                      <Clock className="w-3.5 h-3.5" />
                      <span>Local Time</span>
                    </div>
                    <div className="text-3xl text-white tabular-nums">{formattedTime}</div>
                    <div className="text-xs text-white/30">{activeTimeZone}</div>
                  </div>
 
                  <div
                    className="p-4 rounded-2xl border border-white/8 space-y-1.5"
                    style={{ background: "rgba(0,0,0,0.2)", backdropFilter: "blur(12px)" }}
                  >
                    <p className="text-white/35 text-xs uppercase tracking-widest">Timing Source</p>
                    <p className="text-white/75 text-sm">
                      {timingSourceLabel}{timingFallbackReason ? ` · ${timingFallbackReason}` : ""}
                    </p>
                    {locationCoords && (
                      <p className="text-white/20 text-xs">{locationCoords}</p>
                    )}
                  </div>
 
                  <Button
                    size="lg"
                    variant="outline"
                    className={`w-full h-11 border text-sm transition-all min-h-[44px] touch-manipulation active:scale-95 ${
                      automationOn
                        ? "border-white/15 text-white/65 hover:bg-white/10"
                        : "border-emerald-400/40 text-emerald-300 hover:bg-emerald-400/10"
                    }`}
                    style={{ background: "rgba(0,0,0,0.25)", backdropFilter: "blur(12px)" }}
                    onClick={handleToggleAutomation}
                  >
                    {automationOn
                      ? t(lang, "dashboard.pauseAutomation")
                      : t(lang, "dashboard.resumeAutomation")}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
 
        {/* ── PRAYER TIMES GRID ── */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-white">Today&apos;s Prayers</h2>
            <button
              onClick={() => navigate("/calendar")}
              className="flex items-center gap-1.5 text-sm text-emerald-400 hover:text-emerald-300 transition-colors"
            >
              <CalendarIcon className="w-4 h-4" />
              Calendar
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
 
          {loadingToday ? (
            <div className="adhan-prayer-grid">
              {PRAYER_ORDER.map((code) => (
                <div
                  key={code}
                  className="h-24 rounded-2xl bg-slate-900/60 border border-slate-800/50 animate-pulse"
                />
              ))}
            </div>
          ) : todayError ? (
            <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-5 text-amber-200 text-sm">
              {todayError}
            </div>
          ) : (
            <div className="adhan-prayer-grid">
              {PRAYER_ORDER.map((code) => {
                const isNext = nextPrayerCode === code;
                const isPassed =
                  !loadingToday &&
                  !isNext &&
                  !!prayersForDisplay?.[code] &&
                  !!nextPrayerCode &&
                  COUNTDOWN_PRAYERS.includes(code as PrayerCode) &&
                  COUNTDOWN_PRAYERS.indexOf(code as PrayerCode) <
                    COUNTDOWN_PRAYERS.indexOf(nextPrayerCode as PrayerCode);
                const colors = PRAYER_COLORS[code];
 
                return (
                  <div
                    key={code}
                    className={`relative flex flex-col items-center justify-center gap-2 p-4 rounded-2xl border transition-all ${
                      isNext
                        ? `${colors.bg} ${colors.border} shadow-lg ${colors.glow}`
                        : isPassed
                        ? "bg-slate-900/30 border-slate-800/30 opacity-50"
                        : "bg-slate-900/60 border-slate-800/50 hover:border-slate-700 hover:bg-slate-900"
                    }`}
                  >
                    {isNext && (
                      <span className="absolute -top-2 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full text-[10px] bg-emerald-600 text-white whitespace-nowrap">
                        Next
                      </span>
                    )}
                    <span className={`${isNext ? colors.icon : isPassed ? "text-slate-600" : "text-slate-500"}`}>
                      {PRAYER_ICONS[code]}
                    </span>
                    <div className="text-center">
                      <div className={`text-xs mb-1 ${isNext ? colors.icon : isPassed ? "text-slate-600" : "text-slate-400"}`}>
                        {PRAYER_LABELS[code]}
                      </div>
                      <div className={`text-sm tabular-nums ${isNext ? colors.time : isPassed ? "text-slate-600" : "text-slate-300"}`}>
                        {prayersForDisplay?.[code] || "--:--"}
                      </div>
                    </div>
                    {isPassed && (
                      <CheckCircle className="w-3 h-3 text-slate-700 absolute top-2 right-2" />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
 
        {/* ── MAIN CONTENT GRID ── */}
        <div className="grid lg:grid-cols-5 gap-5">
 
          {/* Left: Hadith + Location */}
          <div className="lg:col-span-3 space-y-5">
 
            {/* Hadith of the Day */}
            <div className="relative overflow-hidden rounded-2xl bg-slate-900/80 border border-white/6 p-6 md:p-8">
              <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber-500/30 to-transparent" />
              <div className="absolute -top-8 -right-8 w-40 h-40 bg-amber-500/5 rounded-full blur-2xl pointer-events-none" />
 
              <div className="flex items-center gap-2.5 mb-5">
                <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                  <BookOpen className="w-4 h-4 text-amber-400" />
                </div>
                <div>
                  <h2 className="text-white text-sm">Hadith of the Day</h2>
                  <p className="text-slate-500 text-xs">{hadithOfDay?.title || "Daily Reminder"}</p>
                </div>
              </div>
 
              {loadingHadith ? (
                <div className="space-y-2 animate-pulse">
                  <div className="h-4 bg-slate-800 rounded w-full" />
                  <div className="h-4 bg-slate-800 rounded w-5/6" />
                  <div className="h-4 bg-slate-800 rounded w-4/6" />
                </div>
              ) : hadithError ? (
                <p className="text-amber-300/80 text-sm">{hadithError}</p>
              ) : hadithOfDay ? (
                <div className="relative">
                  <div className="absolute -top-4 -left-2 text-4xl text-emerald-500/15 leading-none select-none font-serif pointer-events-none">&ldquo;</div>
                  <p className="relative text-slate-200 leading-7 pl-5 text-sm md:text-base italic">
                    {hadithOfDay.textEnglish}
                  </p>
                  <div className="mt-4 pt-4 border-t border-white/5 flex items-center gap-2">
                    <div className="w-1 h-4 rounded-full bg-amber-500/40" />
                    <p className="text-slate-500 text-xs">
                      {hadithOfDay.reference}
                      {hadithOfDay.narrator ? ` · ${hadithOfDay.narrator}` : ""}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-slate-500 text-sm">No daily reminder available.</p>
              )}
            </div>
 
            {/* Location & Settings Info */}
            <div className="rounded-2xl bg-slate-900/80 border border-white/6 p-5 divide-y divide-white/5">
              <div className="flex items-center gap-3 pb-4">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center flex-shrink-0">
                  <MapPin className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-slate-500 mb-0.5">Location</div>
                  <div className="text-white text-sm">{locationLabel || "Not available"}</div>
                </div>
              </div>
 
              <div className="flex items-center gap-3 py-4">
                <div className="w-8 h-8 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center flex-shrink-0">
                  <MoonStar className="w-4 h-4 text-cyan-400" />
                </div>
                <div>
                  <div className="text-xs text-slate-500 mb-0.5">Prayer Method</div>
                  <div className="text-white text-sm">{calcLabel} · {madhhabLabel}</div>
                </div>
              </div>
 
              <div className="flex items-center gap-3 py-4">
                <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center flex-shrink-0">
                  <Clock3 className="w-4 h-4 text-amber-400" />
                </div>
                <div>
                  <div className="text-xs text-slate-500 mb-0.5">Timezone</div>
                  <div className="text-white text-sm">{activeTimeZone}</div>
                </div>
              </div>
 
              {quietHours && (
                <div className="flex items-center gap-3 pt-4">
                  <div className="w-8 h-8 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center flex-shrink-0">
                    <Volume2 className="w-4 h-4 text-purple-400" />
                  </div>
                  <div>
                    <div className="text-xs text-slate-500 mb-0.5">Quiet Hours</div>
                    <div className="text-white text-sm">{quietHours.from} – {quietHours.to}</div>
                  </div>
                </div>
              )}
 
              {settingsError && (
                <div className="mt-4 pt-4 rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2.5 text-amber-200 text-xs">
                  {settingsError}
                </div>
              )}
            </div>
          </div>
 
          {/* Right: Mosque + Platforms */}
          <div className="lg:col-span-2 space-y-5">
 
            {/* Mosque */}
            <div className="rounded-2xl bg-slate-900/80 border border-white/6 p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                    <Building2 className="w-3.5 h-3.5 text-emerald-400" />
                  </div>
                  <h2 className="text-white text-sm">Mosque</h2>
                </div>
                <button
                  onClick={() => navigate("/mosque")}
                  className="text-xs text-slate-500 hover:text-emerald-400 transition-colors flex items-center gap-1"
                >
                  {mosque ? "Change" : "Select"}
                  <ChevronRight className="w-3 h-3" />
                </button>
              </div>
 
              {mosque ? (
                <div className="space-y-3">
                  <div className="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/15">
                    <div className="text-white text-sm mb-1">{mosque.name}</div>
                    <div className="text-slate-400 text-xs">
                      {mosque.address || mosque.city || "Selected mosque"}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800/50 border border-white/5">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    <span className="text-slate-400 text-xs">
                      {userSettings?.useMosqueLocation
                        ? "Following mosque timings"
                        : "Mosque saved · personal timings active"}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-700/40 text-center">
                  <div className="w-10 h-10 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center mx-auto mb-3">
                    <Building2 className="w-5 h-5 text-slate-600" />
                  </div>
                  <p className="text-slate-500 text-sm">No mosque selected</p>
                  <p className="text-slate-600 text-xs mt-1">Using calculation-based timings</p>
                </div>
              )}
 
              {!mosque && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full border-slate-700 text-slate-300 hover:bg-slate-800 mt-3 h-9 text-sm min-h-[44px] touch-manipulation"
                  onClick={() => navigate("/mosque")}
                >
                  Choose a Mosque
                </Button>
              )}
            </div>
 
            {/* Connected Platforms */}
            <div className="rounded-2xl bg-slate-900/80 border border-white/6 p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
                    <Settings2 className="w-3.5 h-3.5 text-violet-400" />
                  </div>
                  <h2 className="text-white text-sm">Platforms</h2>
                </div>
                <button
                  onClick={() => navigate("/settings")}
                  className="text-xs text-slate-500 hover:text-violet-400 transition-colors flex items-center gap-1"
                >
                  Manage
                  <ChevronRight className="w-3 h-3" />
                </button>
              </div>
 
              {connectedPlatforms.length > 0 ? (
                <div className="space-y-2 mb-4">
                  {connectedPlatforms.map((platform: string) => (
                    <div
                      key={platform}
                      className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-slate-800/40 border border-white/5 hover:border-white/10 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs border ${
                            PLATFORM_COLORS[platform] || "bg-slate-700 border-slate-600 text-slate-300"
                          }`}
                        >
                          {PLATFORM_INITIALS[platform] || platform[0]?.toUpperCase()}
                        </div>
                        <span className="text-white text-sm">
                          {PLATFORM_NAMES[platform] || titleCase(platform)}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 text-emerald-400">
                        <CheckCircle className="w-3.5 h-3.5" />
                        <span className="text-xs">Active</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-700/40 text-center mb-3">
                  <p className="text-slate-500 text-sm">No platforms connected</p>
                </div>
              )}
 
              <div className="flex items-center justify-between text-xs text-slate-600 px-1">
                <span>{deviceCount} device{deviceCount === 1 ? "" : "s"} available</span>
                {connectedPlatforms.length > 0 && (
                  <span className="text-emerald-600">{connectedPlatforms.length} active</span>
                )}
              </div>
            </div>
          </div>
        </div>
 
        {/* Footer */}
        <div className="text-center pb-2">
          <p className="text-slate-700 text-xs">
            Prayer times calculated from your saved settings, timing source, and selected juristic method.
          </p>
        </div>
      </div>
    </div>
  );
}