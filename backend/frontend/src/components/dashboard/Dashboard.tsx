import { useEffect, useMemo, useState } from "react";
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
import { Badge } from "../ui/badge";
import {
  Building2,
  CheckCircle,
  Volume2,
  MoonStar,
  MapPin,
  Clock3,
  BookOpen,
  Clock,
  Calendar as CalendarIcon,
  Wifi,
  WifiOff,
  AlertCircle,
  Link2,
} from "lucide-react";
import {
  AlexaIcon,
  GoogleIcon,
  AppleIcon,
  SamsungIcon,
  SonosIcon,
} from "../shared/BrandIcons";

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

const PLATFORM_ICONS: Record<string, any> = {
  alexa: AlexaIcon,
  google: GoogleIcon,
  apple: AppleIcon,
  samsung: SamsungIcon,
  sonos: SonosIcon,
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
    accountEnabled:
      src.accountEnabled === true || src.account_enabled === true,
    prayerConfigs: normalizePrayerConfigs(src.prayerConfigs),
    mosqueId: typeof src.mosqueId === "string" ? src.mosqueId : null,
    mosqueName: typeof src.mosqueName === "string" ? src.mosqueName : null,
    mosqueAddress:
      typeof src.mosqueAddress === "string" ? src.mosqueAddress : null,
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
    String(payload.sect || "").trim().toUpperCase() === "SHIA"
      ? "SHIA"
      : "SUNNI";

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
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(
    2,
    "0"
  )}:${String(seconds).padStart(2, "0")}`;
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

  if (hasAmazonToken) {
    merged.add("alexa");
  }

  return Array.from(merged);
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
    const timer = window.setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

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

      const diffMs = Math.max(
        0,
        (nextEntry.seconds - adjustedNowSeconds) * 1000
      );
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
  const currentTimeSeconds = useMemo(() => {
    const nowParts = getNowInTimeZone(activeTimeZone);
    if (!nowParts) return null;
    return nowParts.hour * 3600 + nowParts.minute * 60 + nowParts.second;
  }, [currentTime, activeTimeZone]);

  const nextPrayerForToday = useMemo(() => {
    if (!prayersForCountdown || currentTimeSeconds == null) return null;

    for (const code of PRAYER_ORDER) {
      const raw = prayersForCountdown[code];
      const seconds = raw ? parsePrayerTimeToSeconds(raw) : null;
      if (seconds != null && seconds > currentTimeSeconds) {
        return code;
      }
    }

    return null;
  }, [prayersForCountdown, currentTimeSeconds]);
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

  const locationLabel = todayData?.location?.label
    ? todayData.location.label
    : todayData?.location?.city
      ? `${todayData.location.city}${todayData.location.country ? `, ${todayData.location.country}` : ""
      }`
      : userSettings?.city
        ? `${userSettings.city}${userSettings.country ? `, ${userSettings.country}` : ""}`
        : "";

  const timingSourceLabel = describeTimingSource(todayData, userSettings);
  const timingFallbackReason = todayData?.sourceDetail?.fallbackReason || null;

  const locationCoords =
    todayData?.location?.latitude != null &&
      todayData?.location?.longitude != null
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
      : titleCase(
        todayData?.method?.madhhab || userSettings?.madhhab || "hanafi"
      );

  const calcLabel = titleCase(
    todayData?.method?.calculationMethod ||
    userSettings?.calculationMethod ||
    (effectiveSect === "SHIA" ? "jafari" : "isna")
  );

  const hadithSect: "SUNNI" | "SHIA" =
    String(todayData?.method?.sect || userSettings?.sect || "SUNNI").toUpperCase() ===
      "SHIA"
      ? "SHIA"
      : "SUNNI";

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
          if (res.status === 401) {
            throw new Error("Your Amazon session expired. Please reconnect Amazon.");
          }
          throw new Error(`Hadith request failed (${res.status})`);
        }

        const payload = normalizeHadith(await res.json());
        if (!payload) {
          throw new Error("Invalid hadith payload.");
        }

        if (!cancelled) {
          setHadithOfDay(payload);
        }
      } catch (err) {
        console.error("Failed to load hadith of the day:", err);
        if (!cancelled) {
          setHadithOfDay(null);
          setHadithError(
            err instanceof Error
              ? err.message
              : "Could not load hadith of the day."
          );
        }
      } finally {
        if (!cancelled) {
          setLoadingHadith(false);
        }
      }
    }

    void loadHadith();

    return () => {
      cancelled = true;
    };
  }, [hasAmazonToken, hadithSect]);

  const gregorianDate = currentTime.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const formattedTime = currentTime.toLocaleTimeString("en-US", {
    timeZone: activeTimeZone,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  if (!hasAmazonToken) {
    return (
      <div className="min-h-screen bg-slate-950">
        <div className="sticky top-0 z-10 bg-slate-950/95 backdrop-blur-sm border-b border-slate-800/50">
          <div className="max-w-7xl mx-auto px-4 py-4 md:px-6">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <Logo />
              <Navigation />
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 py-6 md:px-6">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8">
            <h1 className="text-white text-2xl mb-3">
              Connect Amazon to finish setup
            </h1>
            <p className="text-slate-300 mb-6">
              Your dashboard needs your Amazon session before it can load
              prayer times, settings, device data, and the daily hadith.
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
    <div className="min-h-screen bg-slate-950">
      <div className="sticky top-0 z-10 bg-slate-950/95 backdrop-blur-sm border-b border-slate-800/50">
        <div className="max-w-7xl mx-auto px-4 py-4 md:px-6">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <Logo />
            <Navigation />
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6 md:px-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <span className="text-slate-300 text-sm">
              {locationLabel || "Location not available"}
            </span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Badge
              variant="outline"
              className={`gap-2 ${automationOn
                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                : "bg-slate-800 text-slate-400 border-slate-700"
                }`}
            >
              {automationOn ? (
                <Wifi className="w-3 h-3" />
              ) : (
                <WifiOff className="w-3 h-3" />
              )}
              {automationOn ? "Automation Active" : "Automation Paused"}
            </Badge>

            <Badge
              variant="outline"
              className="border-slate-700 text-slate-400"
            >
              <CheckCircle className="w-3 h-3 mr-1.5" />
              {deviceCount} Device{deviceCount !== 1 ? "s" : ""}
            </Badge>
          </div>
        </div>

        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-500/20 via-teal-500/10 to-slate-900 border border-emerald-500/20 p-6 md:p-10">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.1),transparent_50%)]" />

          <div className="relative z-10">
            <div className="flex items-start justify-between gap-4 flex-wrap mb-6 md:mb-8">
              <div>
                <p className="text-slate-400 text-sm mb-1">Assalamu Alaikum</p>
                <h1 className="text-white text-3xl md:text-4xl mb-2">
                  Next Prayer
                </h1>
                <p className="text-slate-400 text-sm">
                  {timingSourceLabel}
                  {timingFallbackReason ? ` · ${timingFallbackReason}` : ""}
                </p>
              </div>

              <div className="text-right">
                <p className="text-slate-400 text-sm mb-1">{gregorianDate}</p>
                <div className="flex justify-end gap-2 flex-wrap">
                  <Badge className="bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
                    {sectLabel}
                  </Badge>
                  <Badge className="bg-slate-800 text-slate-200 border border-slate-700">
                    {madhhabLabel}
                  </Badge>
                  <Badge className="bg-slate-800 text-slate-200 border border-slate-700">
                    {calcLabel}
                  </Badge>
                </div>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-6 md:gap-8 items-center">
              <div>
                {loadingToday ? (
                  <div className="space-y-3">
                    <p className="text-slate-400 text-sm">Loading next prayer…</p>
                    <div className="text-4xl md:text-5xl text-slate-400">--:--:--</div>
                  </div>
                ) : todayError ? (
                  <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4">
                    <div className="flex items-start gap-3">
                      <AlertCircle className="w-5 h-5 text-amber-400 mt-0.5" />
                      <div>
                        <p className="text-amber-300 text-sm font-medium">
                          Could not load prayer times
                        </p>
                        <p className="text-amber-200/80 text-sm mt-1">
                          {todayError}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div>
                      <p className="text-slate-400 text-sm mb-2">Time Remaining</p>
                      <div className="text-5xl md:text-6xl text-white tracking-tight mb-4 tabular-nums">
                        {timeToNextPrayer || "--:--:--"}
                      </div>
                    </div>

                    <div className="flex items-baseline gap-3 flex-wrap">
                      <span className="text-2xl md:text-3xl text-emerald-400">
                        {nextPrayerCode ? PRAYER_LABELS[nextPrayerCode] : "—"}
                      </span>
                      <span className="text-xl text-slate-300">
                        {nextPrayerTimeDisplay || "--:--"}
                      </span>
                    </div>

                    <div className="bg-slate-900/50 rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-gradient-to-r from-emerald-500 to-teal-400 h-full transition-all duration-500"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-3">
                <Button
                  size="lg"
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-500/20 h-12 md:h-14 text-base md:text-lg"
                  onClick={() => navigate("/alexa-setup")}
                >
                  <Link2 className="w-5 h-5 mr-2" />
                  Open Alexa Setup
                </Button>

                <Button
                  size="lg"
                  variant="outline"
                  className="w-full border-slate-700 text-slate-300 hover:bg-slate-800/50 h-11 md:h-12"
                  onClick={() => navigate("/settings")}
                >
                  {automationOn ? "Manage" : "Resume"} Automation
                </Button>
              </div>
            </div>

            <div className="mt-6 md:mt-8 pt-6 border-t border-slate-700/50">
              <div className="flex items-center gap-2 text-slate-400">
                <Clock className="w-4 h-4" />
                <span className="text-sm">
                  Current Time:{" "}
                  <span className="text-slate-300 tabular-nums">
                    {formattedTime}
                  </span>
                  {activeTimeZone ? ` · ${activeTimeZone}` : ""}
                </span>
              </div>
              {locationCoords && (
                <div className="mt-2 text-xs text-slate-500">
                  Coordinates: {locationCoords}
                </div>
              )}
            </div>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-white text-xl">Today&apos;s Prayer Times</h2>
            <Button
              variant="ghost"
              size="sm"
              className="text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10"
              onClick={() => navigate("/calendar")}
            >
              <CalendarIcon className="w-4 h-4 mr-2" />
              Calendar
            </Button>
          </div>

          {loadingToday ? (
            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 text-slate-400">
              Loading prayer times…
            </div>
          ) : todayError ? (
            <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-6 text-amber-200">
              {todayError}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {PRAYER_ORDER.map((code) => {
                const prayerRaw = prayersForCountdown?.[code];
                const prayerSeconds = prayerRaw ? parsePrayerTimeToSeconds(prayerRaw) : null;

                const isNext = nextPrayerForToday === code;
                const isPassed =
                  currentTimeSeconds != null &&
                  prayerSeconds != null &&
                  prayerSeconds <= currentTimeSeconds &&
                  !isNext;

                return (
                  <div
                    key={code}
                    className={`relative p-4 rounded-2xl transition-all ${isNext
                      ? "bg-emerald-500/10 border-2 border-emerald-500/40 shadow-lg shadow-emerald-500/10"
                      : isPassed
                        ? "bg-slate-900/50 border border-slate-800/50 opacity-60"
                        : "bg-slate-900 border border-slate-800 hover:border-slate-700"
                      }`}
                  >
                    {isNext && (
                      <Badge className="absolute -top-2 -right-2 bg-emerald-600 text-white border-0 text-xs">
                        Next
                      </Badge>
                    )}

                    <div className="text-center">
                      <h3
                        className={`mb-1 text-sm ${isNext ? "text-emerald-400" : "text-white"
                          }`}
                      >
                        {PRAYER_LABELS[code]}
                      </h3>
                      <p
                        className={`text-base ${isNext ? "text-emerald-300" : "text-slate-400"
                          }`}
                      >
                        {prayersForDisplay?.[code] || "--:--"}
                      </p>
                    </div>

                    {isPassed && (
                      <div className="absolute top-2 right-2">
                        <CheckCircle className="w-4 h-4 text-slate-600" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          <div className="space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
              <div className="flex items-center gap-2 mb-4">
                <BookOpen className="w-5 h-5 text-emerald-400" />
                <h2 className="text-white text-xl">Hadith of the Day</h2>
              </div>

              {loadingHadith ? (
                <p className="text-slate-400">Loading hadith of the day…</p>
              ) : hadithError ? (
                <p className="text-amber-300 text-sm">{hadithError}</p>
              ) : hadithOfDay ? (
                <div className="space-y-3">
                  <p className="text-slate-300 leading-7 italic">
                    &ldquo;{hadithOfDay.textEnglish}&rdquo;
                  </p>
                  <p className="text-slate-500 text-sm">
                    {hadithOfDay.reference}
                    {hadithOfDay.narrator ? ` · ${hadithOfDay.narrator}` : ""}
                  </p>
                </div>
              ) : (
                <p className="text-slate-400">No daily reminder available.</p>
              )}
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
              <div className="flex items-start gap-3">
                <MapPin className="w-4 h-4 text-emerald-400 mt-1 flex-shrink-0" />
                <div className="flex-1">
                  <div className="text-white text-sm font-medium">Location</div>
                  <div className="text-slate-400 text-sm">
                    {locationLabel || "Location not available"}
                  </div>
                  {locationCoords && (
                    <div className="text-slate-500 text-xs mt-1">{locationCoords}</div>
                  )}
                </div>
              </div>

              <div className="flex items-start gap-3">
                <MoonStar className="w-4 h-4 text-cyan-400 mt-1 flex-shrink-0" />
                <div>
                  <div className="text-white text-sm font-medium">Prayer Method</div>
                  <div className="text-slate-400 text-sm">
                    {calcLabel} · {madhhabLabel}
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Clock3 className="w-4 h-4 text-amber-400 mt-1 flex-shrink-0" />
                <div>
                  <div className="text-white text-sm font-medium">Timezone</div>
                  <div className="text-slate-400 text-sm">{activeTimeZone}</div>
                </div>
              </div>

              {quietHours && (
                <div className="flex items-start gap-3">
                  <Volume2 className="w-4 h-4 text-purple-400 mt-1 flex-shrink-0" />
                  <div>
                    <div className="text-white text-sm font-medium">Quiet Hours</div>
                    <div className="text-slate-400 text-sm">
                      {quietHours.from} – {quietHours.to}
                    </div>
                  </div>
                </div>
              )}

              {settingsError && (
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-3 text-amber-200 text-sm">
                  {settingsError}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
              <h2 className="text-white mb-4 text-xl">Mosque</h2>

              {mosque ? (
                <div className="space-y-2 mb-4">
                  <div className="flex items-center gap-3 p-4 bg-slate-800/50 rounded-xl">
                    <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center border border-emerald-500/40 flex-shrink-0">
                      <Building2 className="w-5 h-5 text-emerald-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-white mb-1">{mosque.name}</div>
                      <div className="text-slate-400 text-sm truncate">
                        {mosque.address || mosque.city || "Selected mosque"}
                      </div>
                    </div>
                  </div>

                  <Badge
                    variant="outline"
                    className="border-emerald-500/30 text-emerald-400 w-full justify-center py-2"
                  >
                    {userSettings?.useMosqueLocation
                      ? "Following mosque timings"
                      : "Mosque saved, personal timings active"}
                  </Badge>
                </div>
              ) : (
                <p className="text-slate-400 text-sm mb-4 p-4 bg-slate-800/50 rounded-xl text-center">
                  No mosque selected. Using calculation-based timings.
                </p>
              )}

              <Button
                variant="outline"
                size="sm"
                className="w-full border-slate-700 text-slate-300 hover:bg-slate-800"
                onClick={() => navigate("/mosque")}
              >
                {mosque ? "Change Mosque" : "Choose a Mosque"}
              </Button>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
              <h2 className="text-white mb-4 text-xl">Connected Platforms</h2>

              {connectedPlatforms.length > 0 ? (
                <div className="space-y-3 mb-4">
                  {connectedPlatforms.map((platform: string) => {
                    const IconComponent = PLATFORM_ICONS[platform];
                    return (
                      <div
                        key={platform}
                        className="flex items-center justify-between p-3 bg-slate-800/50 rounded-xl hover:bg-slate-800 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          {IconComponent ? (
                            <IconComponent className="w-10 h-10" />
                          ) : (
                            <Link2 className="w-5 h-5 text-slate-400" />
                          )}
                          <span className="text-white">
                            {PLATFORM_NAMES[platform] || titleCase(platform)}
                          </span>
                        </div>
                        <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 border">
                          <CheckCircle className="w-3 h-3 mr-1" />
                          Active
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-slate-400 mb-4">No platforms connected yet.</p>
              )}

              <p className="text-slate-400 text-sm mb-4">
                {deviceCount} device{deviceCount === 1 ? "" : "s"} available
              </p>

              <Button
                variant="outline"
                size="sm"
                className="w-full border-slate-700 text-slate-300 hover:bg-slate-800"
                onClick={() => navigate("/settings")}
              >
                Manage Platforms
              </Button>
            </div>
          </div>
        </div>

        <div className="text-center py-4">
          <p className="text-slate-500 text-sm">
            Prayer times are calculated from your saved settings, current timing
            source, and selected juristic method.
          </p>
        </div>
      </div>
    </div>
  );
}