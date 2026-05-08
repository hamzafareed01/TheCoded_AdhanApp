import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Logo } from "../shared/Logo";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Switch } from "../ui/switch";
import { Checkbox } from "../ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { ArrowLeft, Save, CheckCircle2 } from "lucide-react";
import {
  apiFetch,
  getStoredAmazonToken,
  subscribeToAmazonAuthChanges,
} from "../../lib/api";
 
type Sect = "SUNNI" | "SHIA";
type PrayerName = "fajr" | "dhuhr" | "asr" | "maghrib" | "isha";
type AfterType = "none" | "dua" | "surah";
 
type JsonRecord = Record<string, unknown>;
type Offsets = Record<PrayerName, number>;
 
type AfterAdhan = {
  type: AfterType;
  payload: JsonRecord | null;
};
 
type PrayerConfig = {
  prayerName: PrayerName;
  enabled: boolean;
  offsetMin: number;
  quietEnabled: boolean;
  quietFrom: string;
  quietTo: string;
  adhanReciterId: string | null;
  afterAdhan: AfterAdhan;
};
 
type UserSettings = {
  sect: Sect;
  language: string;
  madhhab: "hanafi" | "shafi";
  calculationMethod: string;
  highLatitudeMethod: string;
  country: string;
  city: string;
  timezone: string;
  latitude: number | null;
  longitude: number | null;
  useMosqueLocation: boolean;
  mosqueId?: string | null;
  mosqueName?: string | null;
  mosqueAddress?: string | null;
  mosqueLat?: number | null;
  mosqueLng?: number | null;
  selectedAlexaDeviceIds?: string[];
  accountEnabled: boolean;
  globalOffsets: Offsets;
  prayerConfigs: PrayerConfig[];
};
 
type Reciter = {
  id: string;
  name: string;
  country?: string | null;
  style?: string | null;
  type?: string;
  sect?: string | null;
};
 
type DuaItem = {
  id: string;
  title: string;
  tags?: string[];
};
 
type SurahItem = {
  number: number;
  nameEnglish: string;
};
 
type Device = {
  id: string;
  name: string;
};
 
type SchedulePayload = {
  surahNumber: number;
  title?: string | null;
  reciterId?: string | null;
};
 
type Schedule = {
  id: string;
  scheduleType: "tilawat";
  timeOfDay: string;
  days: boolean[];
  enabled: boolean;
  deviceId: string | null;
  payload: SchedulePayload;
  createdAt?: string;
};
 
type SettingsProps = {
  onboardingData: Record<string, unknown>;
  setOnboardingData: (data: Record<string, unknown>) => void;
};
 
const PRAYERS: PrayerName[] = ["fajr", "dhuhr", "asr", "maghrib", "isha"];
const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const NONE_VALUE = "__none__";
const SUNNI_CALCULATION_OPTIONS = [
  { value: "isna", label: "ISNA (North America)" },
  { value: "mwl", label: "Muslim World League" },
  { value: "egypt", label: "Egyptian Survey" },
  { value: "karachi", label: "Karachi" },
  { value: "makkah", label: "Makkah" },
  { value: "ummAlQura", label: "Umm Al-Qura" },
];
const SHIA_CALCULATION_OPTIONS = [
  { value: "jafari", label: "Jafari" },
  { value: "tehran", label: "Tehran" },
];
 
function getCalculationOptions(sect: Sect) {
  return sect === "SHIA" ? SHIA_CALCULATION_OPTIONS : SUNNI_CALCULATION_OPTIONS;
}
 
function getSafeCalculationMethod(sect: Sect, value: string) {
  const options = getCalculationOptions(sect);
  return options.some((item) => item.value === value)
    ? value
    : options[0].value;
}
 
function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
 
function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
 
function asBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}
 
function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
 
function sanitizeNonNegativeOffset(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.trunc(n));
}
 
function normalizeCountry(value: unknown): string {
  const raw = String(value ?? "").trim().replace(/\s+/g, " ");
  if (!raw) return "US";
  if (/^[A-Za-z]{2}$/.test(raw)) return raw.toUpperCase();
  return raw;
}
 
function normalizeCity(value: unknown): string {
  const raw = String(value ?? "").trim().replace(/\s+/g, " ");
  return raw || "Chicago";
}
 
function normalizeTimezone(value: unknown): string {
  return String(value ?? "").trim();
}
 
function getBrowserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "Etc/UTC";
  } catch {
    return "Etc/UTC";
  }
}
 
function defaultPrayerConfigs(): PrayerConfig[] {
  return PRAYERS.map((prayerName) => ({
    prayerName,
    enabled: true,
    offsetMin: 0,
    quietEnabled: false,
    quietFrom: "22:00",
    quietTo: "07:00",
    adhanReciterId: null,
    afterAdhan: {
      type: "none",
      payload: null,
    },
  }));
}
 
function safeParseJson(value: unknown): JsonRecord | null {
  if (typeof value !== "string" || !value.trim()) return null;
 
  try {
    const parsed: unknown = JSON.parse(value);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
 
function normalizeAfterAdhan(source: unknown): AfterAdhan {
  if (!isRecord(source)) {
    return { type: "none", payload: null };
  }
 
  if (isRecord(source.afterAdhan)) {
    const nestedType =
      source.afterAdhan.type === "dua" || source.afterAdhan.type === "surah"
        ? source.afterAdhan.type
        : "none";
 
    return {
      type: nestedType,
      payload: isRecord(source.afterAdhan.payload)
        ? source.afterAdhan.payload
        : null,
    };
  }
 
  const flatType =
    source.after_type === "dua" || source.after_type === "surah"
      ? source.after_type
      : "none";
 
  return {
    type: flatType,
    payload: safeParseJson(source.after_payload_json),
  };
}
 
function normalizePrayerConfigs(source: unknown): PrayerConfig[] {
  const incoming = Array.isArray(source)
    ? source.filter((item): item is JsonRecord => isRecord(item))
    : [];
 
  return defaultPrayerConfigs().map((base) => {
    const found = incoming.find((item) => {
      const prayerName =
        asString(item.prayerName)?.toLowerCase() ||
        asString(item.prayer_name)?.toLowerCase() ||
        "";
      return prayerName === base.prayerName;
    });
 
    if (!found) return base;
 
    return {
      prayerName: base.prayerName,
      enabled: found.enabled !== false,
      offsetMin: asNumber(found.offsetMin) ?? asNumber(found.offset_min) ?? 0,
      quietEnabled:
        asBoolean(found.quietEnabled) ??
        asBoolean(found.quiet_enabled) ??
        false,
      quietFrom:
        (asString(found.quietFrom) ??
          asString(found.quiet_from) ??
          "22:00").slice(0, 5),
      quietTo:
        (asString(found.quietTo) ??
          asString(found.quiet_to) ??
          "07:00").slice(0, 5),
      adhanReciterId:
        asString(found.adhanReciterId) ??
        asString(found.adhan_reciter_id),
      afterAdhan: normalizeAfterAdhan(found),
    };
  });
}
 
function normalizeSettings(payload: unknown): UserSettings {
  const root = isRecord(payload) ? payload : {};
  const src = isRecord(root.settings) ? root.settings : root;
  const sect: Sect = src.sect === "SHIA" || src.shia === true ? "SHIA" : "SUNNI";
 
  const offsetsSource = isRecord(src.globalOffsets)
    ? src.globalOffsets
    : isRecord(src.offsets)
    ? src.offsets
    : {};
 
  return {
    sect,
    language: asString(src.language) ?? "en",
    madhhab:
      (asString(src.madhhab) ?? "hanafi").toLowerCase() === "shafi"
        ? "shafi"
        : "hanafi",
    calculationMethod: getSafeCalculationMethod(
      sect,
      asString(src.calculationMethod) ??
        asString(src.calculation_method) ??
        (sect === "SHIA" ? "jafari" : "isna")
    ),
    highLatitudeMethod:
      asString(src.highLatitudeMethod) ??
      asString(src.high_latitude_method) ??
      "automatic",
    country: normalizeCountry(src.country),
    city: normalizeCity(src.city),
    timezone: normalizeTimezone(src.timezone) || getBrowserTimezone(),
    latitude: asNumber(src.latitude),
    longitude: asNumber(src.longitude),
    useMosqueLocation: asBoolean(src.useMosqueLocation) ?? false,
    mosqueId: asString(src.mosqueId),
    mosqueName: asString(src.mosqueName),
    mosqueAddress: asString(src.mosqueAddress),
    mosqueLat: asNumber(src.mosqueLat),
    mosqueLng: asNumber(src.mosqueLng),
    selectedAlexaDeviceIds: Array.isArray(src.selectedAlexaDeviceIds)
      ? src.selectedAlexaDeviceIds.filter(
          (id): id is string => typeof id === "string" && id.trim().length > 0
        )
      : [],
    accountEnabled:
      asBoolean(src.accountEnabled) ??
      asBoolean(src.account_enabled) ??
      false,
    globalOffsets: {
      fajr: asNumber(offsetsSource.fajr) ?? 0,
      dhuhr: asNumber(offsetsSource.dhuhr) ?? 0,
      asr: asNumber(offsetsSource.asr) ?? 0,
      maghrib: asNumber(offsetsSource.maghrib) ?? 0,
      isha: asNumber(offsetsSource.isha) ?? 0,
    },
    prayerConfigs: normalizePrayerConfigs(src.prayerConfigs),
  };
}
 
function normalizeReciters(payload: unknown): Reciter[] {
  const list = Array.isArray(payload)
    ? payload
    : isRecord(payload) && Array.isArray(payload.reciters)
    ? payload.reciters
    : [];
 
  return list
    .filter((item): item is JsonRecord => isRecord(item))
    .map((item) => ({
      id: asString(item.id) ?? "",
      name: asString(item.name) ?? "",
      country: asString(item.country),
      style: asString(item.style),
      type: asString(item.type) ?? undefined,
      sect: asString(item.sect),
    }))
    .filter((item) => item.id && item.name);
}
 
function normalizeDuas(payload: unknown): DuaItem[] {
  if (!isRecord(payload) || !Array.isArray(payload.categories)) return [];
 
  const flat: DuaItem[] = [];
 
  for (const category of payload.categories) {
    if (!isRecord(category) || !Array.isArray(category.items)) continue;
 
    for (const item of category.items) {
      if (!isRecord(item)) continue;
 
      const id = asString(item.id) ?? "";
      const title = asString(item.title) ?? "";
      const tags = Array.isArray(item.tags)
        ? item.tags.filter((tag): tag is string => typeof tag === "string")
        : undefined;
      if (id && title) flat.push({ id, title, tags });
    }
  }
 
  return flat;
}
 
function normalizeSurahs(payload: unknown): SurahItem[] {
  if (!isRecord(payload) || !Array.isArray(payload.surahs)) return [];
 
  return payload.surahs
    .filter((item): item is JsonRecord => isRecord(item))
    .map((item) => ({
      number: asNumber(item.number) ?? NaN,
      nameEnglish: asString(item.nameEnglish) ?? "",
    }))
    .filter(
      (item) => Number.isFinite(item.number) && item.number >= 1 && !!item.nameEnglish
    );
}
 
function normalizeDevices(payload: unknown): Device[] {
  const list = Array.isArray(payload)
    ? payload
    : isRecord(payload) && Array.isArray(payload.devices)
    ? payload.devices
    : [];
 
  return list
    .filter((item): item is JsonRecord => isRecord(item))
    .map((item) => ({
      id: asString(item.id) ?? "",
      name: asString(item.name) ?? "",
    }))
    .filter((item) => item.id && item.name);
}
 
function normalizeSchedules(payload: unknown): Schedule[] {
  if (!isRecord(payload) || !Array.isArray(payload.schedules)) return [];
 
  return payload.schedules
    .filter((item): item is JsonRecord => isRecord(item))
    .map((item) => ({
      id: asString(item.id) ?? "",
      scheduleType: "tilawat" as const,
      timeOfDay: (asString(item.timeOfDay) ?? "06:30").slice(0, 5),
      days:
        Array.isArray(item.days) && item.days.length === 7
          ? item.days.map((d) => d === true)
          : [true, true, true, true, true, true, true],
      enabled: item.enabled !== false,
      deviceId: asString(item.deviceId),
      payload: isRecord(item.payload)
        ? {
            surahNumber: asNumber(item.payload.surahNumber) ?? 1,
            title: asString(item.payload.title),
            reciterId: asString(item.payload.reciterId),
          }
        : { surahNumber: 1 },
      createdAt: asString(item.createdAt) ?? undefined,
    }))
    .filter((item) => !!item.id);
}
 
async function saveSettings(payload: JsonRecord) {
  const put = await apiFetch("/api/user/settings", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
  if (put.ok) return put;
 
  return apiFetch("/api/user/settings", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
 
async function geocodeLocation(city: string, country: string) {
  const params = new URLSearchParams({
    city: city.trim(),
    country: country.trim(),
  });
 
  const res = await apiFetch(`/api/geocode?${params.toString()}`);
  const data = await res.json().catch(() => null);
 
  if (!res.ok) {
    throw new Error(
      (isRecord(data) && asString(data.error)) ||
        "Could not geocode the selected location."
    );
  }
 
  if (!isRecord(data)) {
    throw new Error("Invalid geocoding response.");
  }
 
  const lat = asNumber(data.lat);
  const lng = asNumber(data.lng);
  const timezone = asString(data.timezone);
 
  if (lat == null || lng == null) {
    throw new Error("Geocoding did not return valid coordinates.");
  }
 
  return {
    lat,
    lng,
    timezone: timezone ?? null,
  };
}
 
function isAfterAdhanDua(dua: DuaItem) {
  if (dua.id === "after_adhan") return true;
  const tags = Array.isArray(dua.tags) ? dua.tags.join(" ").toLowerCase() : "";
  const title = dua.title.toLowerCase();
  return title.includes("after adhan") || tags.includes("after adhan") || tags.includes("adhan");
}
 
export default function Settings({
  onboardingData,
  setOnboardingData,
}: SettingsProps) {
  const navigate = useNavigate();
  const [hasAmazonToken, setHasAmazonToken] = useState<boolean>(
    !!getStoredAmazonToken()
  );
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [reciters, setReciters] = useState<Reciter[]>([]);
  const [duas, setDuas] = useState<DuaItem[]>([]);
  const [surahs, setSurahs] = useState<SurahItem[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
 
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
 
  const [newTime, setNewTime] = useState("06:30");
  const [newDays, setNewDays] = useState<boolean[]>([
    true,
    true,
    true,
    true,
    true,
    true,
    true,
  ]);
  const [newSurah, setNewSurah] = useState<number>(1);
  const [newTitle, setNewTitle] = useState<string>("");
  const [newReciterId, setNewReciterId] = useState<string>(NONE_VALUE);
  const [newDeviceId, setNewDeviceId] = useState<string>(NONE_VALUE);
 
  const offsetsRows = useMemo(() => PRAYERS, []);
  const afterAdhanDuas = useMemo(
    () => duas.filter(isAfterAdhanDua),
    [duas]
  );
  const recitersSorted = useMemo(
    () => [...reciters].sort((a, b) => a.name.localeCompare(b.name)),
    [reciters]
  );
 
  useEffect(() => {
    return subscribeToAmazonAuthChanges(() => {
      setHasAmazonToken(!!getStoredAmazonToken());
    });
  }, []);
 
  useEffect(() => {
    async function loadAll() {
      try {
        setError(null);
 
        const [settingsRes, recitersRes, duasRes, surahsRes, devicesRes] =
          await Promise.all([
            apiFetch("/api/user/settings"),
            apiFetch("/api/library/reciters?type=adhan"),
            apiFetch("/api/duas"),
            apiFetch("/api/quran/surahs"),
            apiFetch("/api/alexa/devices"),
          ]);
 
        if (!settingsRes.ok) {
          if (settingsRes.status === 401) {
            throw new Error("Your Amazon session expired. Please reconnect Amazon.");
          }
          throw new Error(`Failed to load settings (${settingsRes.status})`);
        }
 
        const settingsJson = await settingsRes.json();
        setSettings(normalizeSettings(settingsJson));
 
        if (recitersRes.ok) {
          const recitersJson = await recitersRes.json();
          setReciters(normalizeReciters(recitersJson));
        }
 
        if (duasRes.ok) {
          const duasJson = await duasRes.json();
          setDuas(normalizeDuas(duasJson));
        }
 
        if (surahsRes.ok) {
          const surahsJson = await surahsRes.json();
          const normalizedSurahs = normalizeSurahs(surahsJson);
          setSurahs(normalizedSurahs);
          if (normalizedSurahs.length > 0) {
            setNewSurah(normalizedSurahs[0].number);
          }
        }
 
        if (devicesRes.ok) {
          const devicesJson = await devicesRes.json();
          setDevices(normalizeDevices(devicesJson));
        }
 
        await loadSchedules();
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Unable to load settings.");
      }
    }
 
    void loadAll();
  }, [hasAmazonToken]);
 
  async function loadSchedules() {
    const res = await apiFetch("/api/user/schedules");
    if (!res.ok) return;
 
    const json = await res.json();
    setSchedules(normalizeSchedules(json));
  }
 
  const updateField = <K extends keyof UserSettings>(
    key: K,
    value: UserSettings[K]
  ) => {
    setSettings((prev) => {
      if (!prev) return prev;
 
      if (key === "sect") {
        const nextSect = value as Sect;
        return {
          ...prev,
          sect: nextSect,
          calculationMethod: getSafeCalculationMethod(nextSect, prev.calculationMethod),
          madhhab: nextSect === "SHIA" ? "hanafi" : prev.madhhab,
        };
      }
 
      if (key === "calculationMethod") {
        return {
          ...prev,
          calculationMethod: getSafeCalculationMethod(prev.sect, value as string),
        };
      }
 
      return { ...prev, [key]: value };
    });
  };
 
  const updatePrayerConfig = (
    prayerName: PrayerName,
    patch: Partial<PrayerConfig>
  ) => {
    setSettings((prev) => {
      if (!prev) return prev;
 
      return {
        ...prev,
        prayerConfigs: prev.prayerConfigs.map((pc) =>
          pc.prayerName === prayerName ? { ...pc, ...patch } : pc
        ),
      };
    });
  };
 
  const toggleSelectedDevice = (deviceId: string, checked: boolean) => {
    setSettings((prev) => {
      if (!prev) return prev;
      const next = checked
        ? Array.from(new Set([...(prev.selectedAlexaDeviceIds ?? []), deviceId]))
        : (prev.selectedAlexaDeviceIds ?? []).filter((id) => id !== deviceId);
      return {
        ...prev,
        selectedAlexaDeviceIds: next,
      };
    });
  };
 
  const handleLocationFieldChange = (
    key: "country" | "city" | "timezone",
    value: string
  ) => {
    setSettings((prev) => {
      if (!prev) return prev;
 
      return {
        ...prev,
        [key]: key === "country" ? normalizeCountry(value) : value,
        latitude: null,
        longitude: null,
      };
    });
  };
 
  const handleSave = async () => {
    if (!settings) return;
 
    setSaving(true);
    setSaveMessage(null);
    setError(null);
 
    try {
      const normalizedCountry = normalizeCountry(settings.country);
      const normalizedCity = normalizeCity(settings.city);
      const typedTimezone = normalizeTimezone(settings.timezone);
 
      if (!normalizedCountry) {
        throw new Error("Country is required.");
      }
 
      if (!normalizedCity) {
        throw new Error("City is required.");
      }
 
      const geo = await geocodeLocation(normalizedCity, normalizedCountry);
 
      const syncedSettings: UserSettings = {
        ...settings,
        country: normalizedCountry,
        city: normalizedCity,
        timezone: typedTimezone || geo.timezone || getBrowserTimezone(),
        latitude: geo.lat,
        longitude: geo.lng,
      };
      const sanitizedGlobalOffsets: Offsets = {
        fajr: sanitizeNonNegativeOffset(syncedSettings.globalOffsets.fajr),
        dhuhr: sanitizeNonNegativeOffset(syncedSettings.globalOffsets.dhuhr),
        asr: sanitizeNonNegativeOffset(syncedSettings.globalOffsets.asr),
        maghrib: sanitizeNonNegativeOffset(syncedSettings.globalOffsets.maghrib),
        isha: sanitizeNonNegativeOffset(syncedSettings.globalOffsets.isha),
      };
 
      const payload: JsonRecord = {
        sect: syncedSettings.sect,
        shia: syncedSettings.sect === "SHIA",
        language: syncedSettings.language,
        madhhab: syncedSettings.madhhab,
        calculationMethod: syncedSettings.calculationMethod,
        highLatitudeMethod: syncedSettings.highLatitudeMethod,
        country: syncedSettings.country,
        city: syncedSettings.city,
        timezone: syncedSettings.timezone,
        latitude: syncedSettings.latitude,
        longitude: syncedSettings.longitude,
        useMosqueLocation: syncedSettings.useMosqueLocation,
        accountEnabled: syncedSettings.accountEnabled,
        selectedAlexaDeviceIds: syncedSettings.selectedAlexaDeviceIds ?? [],
        globalOffsets: sanitizedGlobalOffsets,
        prayerConfigs: syncedSettings.prayerConfigs.map((pc) => ({
          prayerName: pc.prayerName,
          enabled: pc.enabled,
          offsetMin: sanitizeNonNegativeOffset(pc.offsetMin),
          quietEnabled: pc.quietEnabled,
          quietFrom: pc.quietFrom,
          quietTo: pc.quietTo,
          adhanReciterId: pc.adhanReciterId,
          afterAdhan: pc.afterAdhan,
        })),
      };
 
      const res = await saveSettings(payload);
      if (!res.ok) {
        const msg = await res.text().catch(() => "");
        throw new Error(`Save failed (${res.status}). ${msg}`.trim());
      }
 
      setSettings(syncedSettings);
 
      setOnboardingData({
        ...onboardingData,
        prayerSettings: {
          ...(isRecord(onboardingData.prayerSettings)
            ? onboardingData.prayerSettings
            : {}),
          sect: syncedSettings.sect,
          shia: syncedSettings.sect === "SHIA",
          madhhab: syncedSettings.madhhab,
          calculationMethod: syncedSettings.calculationMethod,
          highLatitudeMode: syncedSettings.highLatitudeMethod,
          offsets: sanitizedGlobalOffsets,
        },
        location: {
          ...(isRecord(onboardingData.location) ? onboardingData.location : {}),
          country: syncedSettings.country,
          city: syncedSettings.city,
          timezone: syncedSettings.timezone,
          latitude: syncedSettings.latitude,
          longitude: syncedSettings.longitude,
          useMosqueLocation: syncedSettings.useMosqueLocation,
        },
        accountEnabled: syncedSettings.accountEnabled,
        devices: syncedSettings.selectedAlexaDeviceIds ?? [],
        prayerConfigs: syncedSettings.prayerConfigs,
      });
 
      setSaveMessage(
        syncedSettings.useMosqueLocation
          ? "Settings saved. Dashboard, Calendar, and Alexa timing flows will prefer the saved mosque when coordinates are available."
          : "Settings saved. Personal location prayer timings are now active."
      );
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not save settings.");
    } finally {
      setSaving(false);
    }
  };
 
  const toggleDay = (idx: number) => {
    setNewDays((prev) => prev.map((value, i) => (i === idx ? !value : value)));
  };
 
  const createSchedule = async () => {
    setError(null);
 
    try {
      const payload: JsonRecord = {
        scheduleType: "tilawat",
        timeOfDay: newTime,
        days: newDays,
        enabled: true,
        deviceId: newDeviceId === NONE_VALUE ? null : newDeviceId,
        payload: {
          surahNumber: newSurah,
          title: newTitle.trim() || null,
          reciterId: newReciterId === NONE_VALUE ? null : newReciterId,
        },
      };
 
      const res = await apiFetch("/api/user/schedules", {
        method: "POST",
        body: JSON.stringify(payload),
      });
 
      if (!res.ok) {
        const msg = await res.text().catch(() => "");
        throw new Error(`Could not create schedule (${res.status}). ${msg}`.trim());
      }
 
      await loadSchedules();
      setNewTitle("");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not create schedule.");
    }
  };
 
  const deleteSchedule = async (id: string) => {
    setError(null);
 
    try {
      const res = await apiFetch(`/api/user/schedules/${id}`, {
        method: "DELETE",
      });
 
      if (!res.ok) {
        const msg = await res.text().catch(() => "");
        throw new Error(`Delete failed (${res.status}). ${msg}`.trim());
      }
 
      await loadSchedules();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not delete schedule.");
    }
  };
 
  return (
    <div className="min-h-screen bg-slate-950 overscroll-none">
      {/* Sticky Header */}
      <div className="sticky top-0 z-20 bg-slate-950/95 backdrop-blur-sm border-b border-slate-800/50" style={{ paddingTop: "env(safe-area-inset-top)" }}>
        <div className="max-w-7xl mx-auto px-4 py-4 md:px-6">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <Logo />
            <Button
              variant="outline"
              onClick={() => navigate("/dashboard")}
              className="border-slate-700 text-slate-300 hover:bg-slate-800 min-h-[44px] touch-manipulation active:bg-slate-800"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Dashboard
            </Button>
          </div>
        </div>
      </div>
 
      <div className="max-w-6xl mx-auto px-4 py-8 md:py-12" style={{ paddingBottom: "calc(6rem + env(safe-area-inset-bottom))" }}>
        {/* Hero Section */}
        <div className="mb-8 md:mb-10">
          <h1 className="text-3xl md:text-4xl font-semibold text-white mb-3">
            Settings
          </h1>
          <p className="text-base text-slate-400 leading-relaxed">
            Prayer times • Devices • Adhan preferences
          </p>
        </div>
 
        {/* Alerts */}
        {error && (
          <div className="mb-6 rounded-xl border border-red-500/50 bg-red-500/10 px-5 py-4">
            <p className="text-red-300 text-sm leading-relaxed">{error}</p>
          </div>
        )}
 
        {saveMessage && (
          <div className="mb-6 rounded-xl border border-emerald-500/50 bg-emerald-500/10 px-5 py-4">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 mt-0.5" />
              <p className="text-emerald-300 text-sm leading-relaxed flex-1">{saveMessage}</p>
            </div>
          </div>
        )}
 
        {/* Main Content */}
        {!settings ? (
          <div className="rounded-3xl border border-slate-800/60 bg-slate-900/40 backdrop-blur-sm p-6 md:p-10">
            <p className="text-slate-400 text-center">Loading settings...</p>
          </div>
        ) : (
          <Tabs defaultValue="prayer" className="w-full">
            <TabsList className="bg-slate-800/60 border border-slate-700/60 w-full justify-start h-auto p-1 rounded-xl mb-6 overflow-x-auto flex-nowrap">
              <TabsTrigger
                value="prayer"
                className="flex-shrink-0 data-[state=active]:bg-emerald-600 data-[state=active]:text-white rounded-lg transition-all px-4 py-2 min-h-[44px] touch-manipulation"
              >
                Prayer Settings
              </TabsTrigger>
              <TabsTrigger
                value="location"
                className="flex-shrink-0 data-[state=active]:bg-emerald-600 data-[state=active]:text-white rounded-lg transition-all px-4 py-2 min-h-[44px] touch-manipulation"
              >
                Location
              </TabsTrigger>
              <TabsTrigger
                value="devices"
                className="flex-shrink-0 data-[state=active]:bg-emerald-600 data-[state=active]:text-white rounded-lg transition-all px-4 py-2 min-h-[44px] touch-manipulation"
              >
                Devices
              </TabsTrigger>
              <TabsTrigger
                value="adhan"
                className="flex-shrink-0 data-[state=active]:bg-emerald-600 data-[state=active]:text-white rounded-lg transition-all px-4 py-2 min-h-[44px] touch-manipulation"
              >
                Per-Prayer Adhan
              </TabsTrigger>
              <TabsTrigger
                value="schedules"
                className="flex-shrink-0 data-[state=active]:bg-emerald-600 data-[state=active]:text-white rounded-lg transition-all px-4 py-2 min-h-[44px] touch-manipulation"
              >
                Tilawat Schedules
              </TabsTrigger>
            </TabsList>
 
            {/* Prayer Settings Tab */}
            <TabsContent value="prayer" className="mt-0">
              <div className="rounded-3xl border border-slate-800/60 bg-slate-900/40 backdrop-blur-sm p-6 md:p-10 space-y-8">
                {/* Sect Selection */}
                <div>
                  <Label className="text-white mb-3 block text-base font-semibold">Tradition</Label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <button
                      type="button"
                      onClick={() => updateField("sect", "SUNNI")}
                      className={`p-5 rounded-xl border-2 text-left transition-all min-h-[88px] touch-manipulation ${
                        settings.sect === "SUNNI"
                          ? "border-emerald-500/50 bg-emerald-500/10"
                          : "border-slate-700/60 bg-slate-800/40 hover:border-slate-600"
                      }`}
                    >
                      <div className="flex items-center gap-3 mb-2">
                        <div className={`h-5 w-5 rounded-full border-2 flex items-center justify-center ${
                          settings.sect === "SUNNI" ? "border-emerald-500 bg-emerald-500" : "border-slate-600"
                        }`}>
                          {settings.sect === "SUNNI" && (
                            <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          )}
                        </div>
                        <div className="text-white font-medium">Sunni</div>
                      </div>
                      <p className="text-slate-400 text-sm">Standard calculation methods</p>
                    </button>
 
                    <button
                      type="button"
                      onClick={() => updateField("sect", "SHIA")}
                      className={`p-5 rounded-xl border-2 text-left transition-all min-h-[88px] touch-manipulation ${
                        settings.sect === "SHIA"
                          ? "border-emerald-500/50 bg-emerald-500/10"
                          : "border-slate-700/60 bg-slate-800/40 hover:border-slate-600"
                      }`}
                    >
                      <div className="flex items-center gap-3 mb-2">
                        <div className={`h-5 w-5 rounded-full border-2 flex items-center justify-center ${
                          settings.sect === "SHIA" ? "border-emerald-500 bg-emerald-500" : "border-slate-600"
                        }`}>
                          {settings.sect === "SHIA" && (
                            <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          )}
                        </div>
                        <div className="text-white font-medium">Shia</div>
                      </div>
                      <p className="text-slate-400 text-sm">Jafari calculation methods</p>
                    </button>
                  </div>
                </div>
 
                {/* Calculation Method */}
                <div>
                  <Label className="text-white mb-2 block text-sm font-medium">
                    Calculation method
                  </Label>
                  <Select
                    value={settings.calculationMethod}
                    onValueChange={(v: string) => updateField("calculationMethod", v)}
                  >
                    <SelectTrigger className="bg-slate-800/60 border-slate-700/60 text-white h-11">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-900 border-slate-700 text-slate-100">
                      {getCalculationOptions(settings.sect).map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="mt-2 text-xs text-slate-500">
                    Different regions use different angle calculations for Fajr and Isha
                  </p>
                </div>
 
                {/* Madhhab - Only for Sunni */}
                {settings.sect === "SUNNI" && (
                  <div>
                    <Label className="text-white mb-2 block text-sm font-medium">
                      Madhhab (Asr calculation)
                    </Label>
                    <Select
                      value={settings.madhhab}
                      onValueChange={(v: string) =>
                        updateField("madhhab", v === "shafi" ? "shafi" : "hanafi")
                      }
                    >
                      <SelectTrigger className="bg-slate-800/60 border-slate-700/60 text-white h-11">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-900 border-slate-700 text-slate-100">
                        <SelectItem value="hanafi">Hanafi (later Asr)</SelectItem>
                        <SelectItem value="shafi">Shafi / Standard</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="mt-2 text-xs text-slate-500">
                      Hanafi calculates Asr when shadow length equals object height + noon shadow
                    </p>
                  </div>
                )}
 
                {/* Shia Info Box */}
                {settings.sect === "SHIA" && (
                  <div className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-5">
                    <div className="flex items-start gap-3">
                      <div className="rounded-lg bg-sky-500/10 p-2 mt-0.5 flex-shrink-0">
                        <svg className="w-4 h-4 text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <p className="text-sm text-slate-300 leading-relaxed flex-1">
                        Shia prayer times use Jafari jurisprudence. The Asr madhhab option only applies to Sunni calculations.
                      </p>
                    </div>
                  </div>
                )}
 
                {/* High Latitude Rule */}
                <div>
                  <Label className="text-white mb-2 block text-sm font-medium">
                    High latitude rule
                  </Label>
                  <Select
                    value={settings.highLatitudeMethod}
                    onValueChange={(v: string) =>
                      updateField("highLatitudeMethod", v)
                    }
                  >
                    <SelectTrigger className="bg-slate-800/60 border-slate-700/60 text-white h-11">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-900 border-slate-700 text-slate-100">
                      <SelectItem value="automatic">Automatic</SelectItem>
                      <SelectItem value="middle_of_the_night">
                        Middle of the Night
                      </SelectItem>
                      <SelectItem value="one_seventh">One Seventh</SelectItem>
                      <SelectItem value="angle_based">Angle Based</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="mt-2 text-xs text-slate-500">
                    Only relevant for locations above 48° latitude where twilight doesn't occur
                  </p>
                </div>
 
                {/* Global Offsets */}
                <div>
                  <div className="mb-5">
                    <h3 className="text-white font-semibold text-base mb-2">Prayer time adjustments</h3>
                    <p className="text-slate-400 text-sm leading-relaxed">
                      Adjust each prayer time to match your mosque
                    </p>
                  </div>
 
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {offsetsRows.map((p) => (
                      <div key={p} className="flex items-center justify-between gap-3 p-3 rounded-lg bg-slate-800/40 border border-slate-700/40">
                        <Label className="text-slate-200 capitalize font-medium text-sm">{p}</Label>
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            min={0}
                            step={1}
                            className="w-20 bg-slate-900/60 border-slate-700/60 text-white h-9 text-center"
                            value={settings.globalOffsets[p]}
                            onChange={(e) => {
                              const nextValue = Math.max(0, Number(e.target.value || 0));
                              updateField("globalOffsets", {
                                ...settings.globalOffsets,
                                [p]: nextValue,
                              });
                            }}
                          />
                          <span className="text-slate-500 text-xs">min</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
 
                {/* Account Enabled */}
                <div className="p-6 rounded-2xl border-2 border-slate-700/60 bg-slate-800/30">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1">
                      <div className="text-white font-semibold mb-1">Enable Adhan playback</div>
                      <p className="text-slate-400 text-sm leading-relaxed">
                        Turn this on to activate automatic Adhan announcements at prayer times
                      </p>
                    </div>
                    <Switch
                      checked={settings.accountEnabled}
                      onCheckedChange={(v: boolean) =>
                        updateField("accountEnabled", v)
                      }
                      className="data-[state=checked]:bg-emerald-500"
                    />
                  </div>
                </div>
              </div>
            </TabsContent>
 
            {/* Location Tab */}
            <TabsContent value="location" className="mt-0">
              <div className="rounded-3xl border border-slate-800/60 bg-slate-900/40 backdrop-blur-sm p-6 md:p-10 space-y-7">
                <div>
                  <Label className="text-white mb-2.5 block text-base font-semibold">Country or region</Label>
                  <Input
                    className="bg-slate-800/60 border-slate-700/60 text-white h-11"
                    value={settings.country}
                    onChange={(e) =>
                      handleLocationFieldChange("country", e.target.value)
                    }
                    placeholder="Example: US, PK, Canada, United Kingdom"
                  />
                </div>
 
                <div>
                  <Label className="text-white mb-2.5 block text-base font-semibold">City</Label>
                  <Input
                    className="bg-slate-800/60 border-slate-700/60 text-white h-11"
                    value={settings.city}
                    onChange={(e) =>
                      handleLocationFieldChange("city", e.target.value)
                    }
                    placeholder="Example: Chicago, Karachi, London, Dubai"
                  />
                </div>
 
                <div>
                  <Label className="text-white mb-2.5 block text-base font-semibold">Timezone</Label>
                  <Input
                    className="bg-slate-800/60 border-slate-700/60 text-white h-11"
                    value={settings.timezone}
                    onChange={(e) =>
                      handleLocationFieldChange("timezone", e.target.value)
                    }
                    placeholder="Example: America/Chicago, Asia/Karachi, Europe/London"
                  />
                  <p className="mt-2 text-xs text-slate-500">
                    Use an IANA timezone name. If left blank, geocoding can supply one on save
                  </p>
                </div>
 
                <div className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-5">
                  <div className="text-white mb-2 text-sm font-semibold">Saved coordinates</div>
                  <div className="text-slate-300 text-sm leading-relaxed">
                    {settings.latitude != null && settings.longitude != null
                      ? `${settings.latitude.toFixed(6)}, ${settings.longitude.toFixed(6)}`
                      : "Will be updated when you save settings"}
                  </div>
                </div>
 
                <div className="p-6 rounded-2xl border-2 border-slate-700/60 bg-slate-800/30">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1">
                      <div className="text-white font-semibold mb-1">Use mosque location for prayer times</div>
                      <p className="text-slate-400 text-sm leading-relaxed">
                        When enabled, the dashboard and calendar use saved mosque coordinates whenever they exist
                      </p>
                      {settings.mosqueName ? (
                        <p className="text-emerald-400 text-sm mt-2">
                          Saved mosque: {settings.mosqueName}
                        </p>
                      ) : (
                        <p className="text-slate-500 text-sm mt-2">
                          No mosque selected yet. The app will fall back to your personal location
                        </p>
                      )}
                    </div>
                    <Switch
                      checked={settings.useMosqueLocation}
                      onCheckedChange={(v: boolean) =>
                        updateField("useMosqueLocation", v)
                      }
                      className="data-[state=checked]:bg-emerald-500"
                    />
                  </div>
                </div>
              </div>
            </TabsContent>
 
            {/* Devices Tab */}
            <TabsContent value="devices" className="mt-0">
              <div className="rounded-3xl border border-slate-800/60 bg-slate-900/40 backdrop-blur-sm p-6 md:p-10">
                <div className="mb-7">
                  <h2 className="text-white text-lg font-semibold mb-2">Your Alexa devices</h2>
                  <p className="text-slate-400 text-sm leading-relaxed">
                    Select devices for Adhan announcements
                  </p>
                </div>
 
                {devices.length === 0 ? (
                  <div className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-6">
                    <p className="text-slate-300 text-sm leading-relaxed">
                      No linked Alexa devices found. Reconnect Amazon in onboarding if needed.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {devices.map((device) => {
                      const checked = (settings.selectedAlexaDeviceIds ?? []).includes(device.id);
 
                      return (
                        <label
                          key={device.id}
                          className={`flex items-center gap-4 p-5 rounded-xl border-2 cursor-pointer transition-all min-h-[72px] touch-manipulation ${
                            checked
                              ? "border-emerald-500/50 bg-emerald-500/10"
                              : "border-slate-700/60 bg-slate-800/40 hover:border-slate-600"
                          }`}
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(value) =>
                              toggleSelectedDevice(device.id, value === true)
                            }
                            className="data-[state=checked]:bg-emerald-500 data-[state=checked]:border-emerald-500"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="text-white font-medium truncate">{device.name}</div>
                            <div className="text-slate-400 text-sm">Selected for Adhan playback</div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                )}
 
                <div className="mt-6 rounded-xl border border-slate-700/50 bg-slate-800/30 p-4">
                  <div className="flex items-start gap-3">
                    <div className="rounded-lg bg-emerald-500/10 p-2 mt-0.5">
                      <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <p className="text-slate-400 text-xs leading-relaxed flex-1">
                      Your device selections are saved to your account so all prayer times use the same devices automatically
                    </p>
                  </div>
                </div>
              </div>
            </TabsContent>
 
            {/* Per-Prayer Adhan Tab - Content continues but truncated for brevity */}
            <TabsContent value="adhan" className="mt-0">
              <div className="rounded-3xl border border-slate-800/60 bg-slate-900/40 backdrop-blur-sm p-6 md:p-10">
                <div className="mb-7">
                  <h2 className="text-white text-lg font-semibold mb-2">Customize each prayer</h2>
                  <p className="text-slate-400 text-sm leading-relaxed">
                    Choose reciter • Add dua or surah
                  </p>
                </div>
 
                <div className="space-y-4">
                  {settings.prayerConfigs.map((pc) => (
                    <div
                      key={pc.prayerName}
                      className="rounded-xl border border-slate-700/60 bg-slate-800/30 p-5"
                    >
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-white font-semibold capitalize text-lg">
                          {pc.prayerName}
                        </h3>
                        <Switch
                          checked={pc.enabled}
                          onCheckedChange={(v: boolean) =>
                            updatePrayerConfig(pc.prayerName, { enabled: v })
                          }
                          className="data-[state=checked]:bg-emerald-500"
                        />
                      </div>
 
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                        {/* Adhan Reciter */}
                        <div className="space-y-2">
                          <Label className="text-slate-200 text-sm font-medium">Adhan reciter</Label>
                          <Select
                            value={pc.adhanReciterId ?? NONE_VALUE}
                            onValueChange={(v: string) =>
                              updatePrayerConfig(pc.prayerName, {
                                adhanReciterId: v === NONE_VALUE ? null : v,
                              })
                            }
                          >
                            <SelectTrigger className="bg-slate-900/60 border-slate-700/60 text-slate-100 h-11">
                              <SelectValue placeholder="Select reciter" />
                            </SelectTrigger>
                            <SelectContent className="bg-slate-900 border-slate-700 text-slate-100 max-h-80">
                              <SelectItem value={NONE_VALUE}>
                                No reciter selected
                              </SelectItem>
                              {recitersSorted.map((r) => (
                                <SelectItem key={r.id} value={r.id}>
                                  {r.name}
                                  {r.sect ? ` · ${r.sect}` : ""}
                                  {r.country ? ` · ${r.country}` : ""}
                                  {r.style ? ` · ${r.style}` : ""}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
 
                        {/* After Adhan */}
                        <div className="space-y-2">
                          <Label className="text-slate-200 text-sm font-medium">After Adhan</Label>
                          <Select
                            value={pc.afterAdhan.type}
                            onValueChange={(v: string) =>
                              updatePrayerConfig(pc.prayerName, {
                                afterAdhan: {
                                  type: v as AfterType,
                                  payload: null,
                                },
                              })
                            }
                          >
                            <SelectTrigger className="bg-slate-900/60 border-slate-700/60 text-slate-100 h-11">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-slate-900 border-slate-700 text-slate-100">
                              <SelectItem value="none">None</SelectItem>
                              <SelectItem value="dua">Play a Dua</SelectItem>
                              <SelectItem value="surah">Play a Surah</SelectItem>
                            </SelectContent>
                          </Select>
 
                          {/* Dua Selection */}
                          {pc.afterAdhan.type === "dua" && (
                            <Select
                              value={
                                asString(pc.afterAdhan.payload?.duaId) ?? NONE_VALUE
                              }
                              onValueChange={(v: string) =>
                                updatePrayerConfig(pc.prayerName, {
                                  afterAdhan:
                                    v === NONE_VALUE
                                      ? { type: "dua", payload: null }
                                      : { type: "dua", payload: { duaId: v } },
                                })
                              }
                            >
                              <SelectTrigger className="bg-slate-900/60 border-slate-700/60 text-slate-100 h-11">
                                <SelectValue placeholder="Select Dua" />
                              </SelectTrigger>
                              <SelectContent className="bg-slate-900 border-slate-700 text-slate-100 max-h-60">
                                <SelectItem value={NONE_VALUE}>
                                  No Dua selected
                                </SelectItem>
                                {afterAdhanDuas.map((d) => (
                                  <SelectItem key={d.id} value={d.id}>
                                    {d.title}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
 
                          {/* Surah Selection */}
                          {pc.afterAdhan.type === "surah" && (
                            <Select
                              value={
                                asNumber(pc.afterAdhan.payload?.surahNumber) != null
                                  ? String(asNumber(pc.afterAdhan.payload?.surahNumber))
                                  : NONE_VALUE
                              }
                              onValueChange={(v: string) =>
                                updatePrayerConfig(pc.prayerName, {
                                  afterAdhan:
                                    v === NONE_VALUE
                                      ? { type: "surah", payload: null }
                                      : {
                                          type: "surah",
                                          payload: { surahNumber: Number(v) },
                                        },
                                })
                              }
                            >
                              <SelectTrigger className="bg-slate-900/60 border-slate-700/60 text-slate-100 h-11">
                                <SelectValue placeholder="Select Surah" />
                              </SelectTrigger>
                              <SelectContent className="bg-slate-900 border-slate-700 text-slate-100 max-h-60">
                                <SelectItem value={NONE_VALUE}>
                                  No Surah selected
                                </SelectItem>
                                {surahs.map((s) => (
                                  <SelectItem
                                    key={s.number}
                                    value={String(s.number)}
                                  >
                                    {s.number}. {s.nameEnglish}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        </div>
                      </div>
 
                      {/* Offset and Quiet Hours */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 pt-4 border-t border-slate-700/50">
                        <div className="space-y-2">
                          <Label className="text-slate-200 text-sm font-medium">Offset (minutes)</Label>
                          <Input
                            type="number"
                            min={0}
                            step={1}
                            className="bg-slate-900/60 border-slate-700/60 text-white h-9"
                            value={pc.offsetMin}
                            onChange={(e) => {
                              const nextValue = Math.max(0, Number(e.target.value || 0));
                              updatePrayerConfig(pc.prayerName, {
                                offsetMin: nextValue,
                              });
                            }}
                          />
                        </div>
 
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <Label className="text-slate-200 text-sm font-medium">Quiet hours</Label>
                            <Switch
                              checked={pc.quietEnabled}
                              onCheckedChange={(v: boolean) =>
                                updatePrayerConfig(pc.prayerName, {
                                  quietEnabled: v,
                                })
                              }
                              className="data-[state=checked]:bg-emerald-500"
                            />
                          </div>
                          {pc.quietEnabled && (
                            <div className="grid grid-cols-2 gap-3">
                              <div className="space-y-1">
                                <Label className="text-slate-400 text-xs">From</Label>
                                <Input
                                  type="time"
                                  className="bg-slate-900/60 border-slate-700/60 text-white h-9"
                                  value={pc.quietFrom}
                                  onChange={(e) =>
                                    updatePrayerConfig(pc.prayerName, {
                                      quietFrom: e.target.value,
                                    })
                                  }
                                />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-slate-400 text-xs">To</Label>
                                <Input
                                  type="time"
                                  className="bg-slate-900/60 border-slate-700/60 text-white h-9"
                                  value={pc.quietTo}
                                  onChange={(e) =>
                                    updatePrayerConfig(pc.prayerName, {
                                      quietTo: e.target.value,
                                    })
                                  }
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </TabsContent>
 
            {/* Tilawat Schedules Tab */}
            <TabsContent value="schedules" className="mt-0">
              <div className="rounded-3xl border border-slate-800/60 bg-slate-900/40 backdrop-blur-sm p-6 md:p-10 space-y-8">
                <div>
                  <h2 className="text-white text-lg font-semibold mb-2">Tilawat schedules</h2>
                  <p className="text-slate-400 text-sm leading-relaxed">
                    Daily Quran recitation schedules
                  </p>
                </div>
 
                {/* Create Schedule Form */}
                <div className="rounded-xl border border-slate-700/60 bg-slate-800/30 p-6">
                  <h3 className="text-white font-semibold mb-4">Create new schedule</h3>
 
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div className="space-y-2">
                      <Label className="text-slate-200 text-sm">Time</Label>
                      <Input
                        type="time"
                        className="bg-slate-900/60 border-slate-700/60 text-white h-11"
                        value={newTime}
                        onChange={(e) => setNewTime(e.target.value)}
                      />
                    </div>
 
                    <div className="space-y-2">
                      <Label className="text-slate-200 text-sm">Surah</Label>
                      <Select
                        value={String(newSurah)}
                        onValueChange={(v: string) => setNewSurah(Number(v))}
                      >
                        <SelectTrigger className="bg-slate-900/60 border-slate-700/60 text-white h-11">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-slate-900 border-slate-700 text-slate-100 max-h-72">
                          {surahs.map((s) => (
                            <SelectItem key={s.number} value={String(s.number)}>
                              {s.number}. {s.nameEnglish}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
 
                    <div className="space-y-2">
                      <Label className="text-slate-200 text-sm">Device (optional)</Label>
                      <Select
                        value={newDeviceId}
                        onValueChange={(v: string) => setNewDeviceId(v)}
                      >
                        <SelectTrigger className="bg-slate-900/60 border-slate-700/60 text-white h-11">
                          <SelectValue placeholder="None" />
                        </SelectTrigger>
                        <SelectContent className="bg-slate-900 border-slate-700 text-slate-100">
                          <SelectItem value={NONE_VALUE}>None</SelectItem>
                          {devices.map((d) => (
                            <SelectItem key={d.id} value={d.id}>
                              {d.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
 
                    <div className="space-y-2">
                      <Label className="text-slate-200 text-sm">Reciter (optional)</Label>
                      <Select
                        value={newReciterId}
                        onValueChange={(v: string) => setNewReciterId(v)}
                      >
                        <SelectTrigger className="bg-slate-900/60 border-slate-700/60 text-white h-11">
                          <SelectValue placeholder="Default" />
                        </SelectTrigger>
                        <SelectContent className="bg-slate-900 border-slate-700 text-slate-100">
                          <SelectItem value={NONE_VALUE}>Default</SelectItem>
                          {recitersSorted.map((r) => (
                            <SelectItem key={r.id} value={r.id}>
                              {r.name}
                              {r.sect ? ` · ${r.sect}` : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
 
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div className="space-y-2">
                      <Label className="text-slate-200 text-sm">Title (optional)</Label>
                      <Input
                        className="bg-slate-900/60 border-slate-700/60 text-white h-11"
                        value={newTitle}
                        onChange={(e) => setNewTitle(e.target.value)}
                        placeholder="e.g., Morning Tilawat"
                      />
                    </div>
 
                    <div className="space-y-2">
                      <Label className="text-slate-200 text-sm">Days</Label>
                      <div className="flex flex-wrap gap-2">
                        {DAY_LABELS.map((d, i) => (
                          <button
                            key={d}
                            type="button"
                            className={`px-3 py-2 rounded-lg border-2 text-sm font-medium transition-colors min-h-[44px] touch-manipulation ${
                              newDays[i]
                                ? "border-emerald-500 bg-emerald-500/10 text-emerald-300"
                                : "border-slate-700 bg-slate-800/40 text-slate-400 hover:border-slate-600"
                            }`}
                            onClick={() => toggleDay(i)}
                          >
                            {d}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
 
                  <Button
                    onClick={createSchedule}
                    className="bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white min-h-[44px] font-medium touch-manipulation active:opacity-90"
                  >
                    Add schedule
                  </Button>
                </div>
 
                {/* Schedules List */}
                <div>
                  <h3 className="text-white font-semibold mb-4">Your schedules</h3>
                  {schedules.length === 0 ? (
                    <div className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-6 text-center">
                      <p className="text-slate-400 text-sm">No schedules created yet</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {schedules.map((s) => (
                        <div
                          key={s.id}
                          className="flex items-center justify-between gap-4 p-5 rounded-xl border border-slate-700/60 bg-slate-800/30"
                        >
                          <div className="flex-1">
                            <div className="text-white font-medium">
                              {s.payload?.title
                                ? s.payload.title
                                : `Tilawat · Surah ${s.payload.surahNumber}`}{" "}
                              · {s.timeOfDay}
                            </div>
                            <div className="text-slate-400 text-sm mt-1">
                              Days:{" "}
                              {s.days
                                .map((on, i) => (on ? DAY_LABELS[i] : null))
                                .filter(Boolean)
                                .join(", ")}
                              {s.deviceId
                                ? ` · Device: ${
                                    devices.find((d) => d.id === s.deviceId)?.name ||
                                    s.deviceId
                                  }`
                                : ""}
                            </div>
                          </div>
 
                          <Button
                            variant="outline"
                            className="border-slate-700 text-slate-300 hover:bg-slate-800 min-h-[44px] touch-manipulation active:bg-slate-800"
                            onClick={() => deleteSchedule(s.id)}
                          >
                            Delete
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </TabsContent>
          </Tabs>
        )}
 
        {/* Floating Save Button */}
        {settings && (
          <div className="sticky flex justify-end mt-8 pt-4" style={{ bottom: "calc(1.5rem + env(safe-area-inset-bottom))" }}>
            <Button
              onClick={handleSave}
              disabled={saving}
              className="bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white min-h-[52px] px-8 font-medium shadow-lg touch-manipulation active:opacity-90"
            >
              <Save className="w-4 h-4 mr-2" />
              {saving ? "Saving settings…" : "Save all settings"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}