import { useEffect, useMemo, useState } from "react";
import { Logo } from "../shared/Logo";
import { Navigation } from "../shared/Navigation";
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
};

type DuaItem = {
  id: string;
  title: string;
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

function defaultOffsets(): Offsets {
  return {
    fajr: 0,
    dhuhr: 0,
    asr: 0,
    maghrib: 0,
    isha: 0,
  };
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

  const offsetsSource = isRecord(src.globalOffsets)
    ? src.globalOffsets
    : isRecord(src.offsets)
    ? src.offsets
    : {};

  return {
    sect: src.sect === "SHIA" || src.shia === true ? "SHIA" : "SUNNI",
    language: asString(src.language) ?? "en",
    madhhab:
      (asString(src.madhhab) ?? "hanafi").toLowerCase() === "shafi"
        ? "shafi"
        : "hanafi",
    calculationMethod:
      asString(src.calculationMethod) ??
      asString(src.calculation_method) ??
      "isna",
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
      if (id && title) flat.push({ id, title });
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

export default function Settings({
  onboardingData,
  setOnboardingData,
}: SettingsProps) {
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

  useEffect(() => {
    return subscribeToAmazonAuthChanges(() => {
      setHasAmazonToken(!!getStoredAmazonToken());
    });
  }, []);

  useEffect(() => {
    async function loadAll() {
      try {
        setError(null);

        if (!hasAmazonToken) {
          setSettings(null);
          setError("Please connect Amazon in onboarding step 2 to use settings.");
          return;
        }

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
        globalOffsets: syncedSettings.globalOffsets,
        prayerConfigs: syncedSettings.prayerConfigs.map((pc) => ({
          prayerName: pc.prayerName,
          enabled: pc.enabled,
          offsetMin: pc.offsetMin,
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
          offsets: syncedSettings.globalOffsets,
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

      setSaveMessage("Settings saved and location synced.");
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
    <div className="min-h-screen bg-slate-950 py-8 px-4">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
          <Logo />
          <Navigation />
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-8">
          <div>
            <h1 className="text-white text-xl mb-1">Settings</h1>
            <p className="text-slate-400 text-sm">
              Sect, calculation, worldwide location sync, per-prayer Adhan, and schedules.
            </p>
          </div>

          {error && (
            <div className="text-sm text-red-400 bg-red-950/40 border border-red-900 rounded-md px-3 py-2">
              {error}
            </div>
          )}

          {saveMessage && (
            <div className="text-sm text-emerald-400 bg-emerald-950/40 border border-emerald-900 rounded-md px-3 py-2">
              {saveMessage}
            </div>
          )}

          {!settings ? (
            <p className="text-slate-400 text-sm">Loading…</p>
          ) : (
            <>
              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h2 className="text-white text-lg">Sect & Calculation</h2>

                  <div className="space-y-2">
                    <Label className="text-slate-200">Sect</Label>
                    <Select
                      value={settings.sect}
                      onValueChange={(v: string) => updateField("sect", v as Sect)}
                    >
                      <SelectTrigger className="bg-slate-900 border-slate-700 text-slate-100">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-900 border-slate-700">
                        <SelectItem value="SUNNI">Sunni</SelectItem>
                        <SelectItem value="SHIA">Shia</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-slate-200">Madhhab</Label>
                    <Select
                      value={settings.madhhab}
                      onValueChange={(v: string) =>
                        updateField("madhhab", v === "shafi" ? "shafi" : "hanafi")
                      }
                    >
                      <SelectTrigger className="bg-slate-900 border-slate-700 text-slate-100">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-900 border-slate-700">
                        <SelectItem value="hanafi">Hanafi</SelectItem>
                        <SelectItem value="shafi">Shafi</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-slate-200">Calculation method</Label>
                    <Select
                      value={settings.calculationMethod}
                      onValueChange={(v: string) =>
                        updateField("calculationMethod", v)
                      }
                    >
                      <SelectTrigger className="bg-slate-900 border-slate-700 text-slate-100">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-900 border-slate-700">
                        <SelectItem value="isna">ISNA (North America)</SelectItem>
                        <SelectItem value="mwl">Muslim World League</SelectItem>
                        <SelectItem value="egypt">Egyptian Survey</SelectItem>
                        <SelectItem value="karachi">Karachi</SelectItem>
                        <SelectItem value="makkah">Makkah</SelectItem>
                        <SelectItem value="ummAlQura">Umm Al-Qura</SelectItem>
                        <SelectItem value="tehran">Tehran</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-slate-200">High latitude rule</Label>
                    <Select
                      value={settings.highLatitudeMethod}
                      onValueChange={(v: string) =>
                        updateField("highLatitudeMethod", v)
                      }
                    >
                      <SelectTrigger className="bg-slate-900 border-slate-700 text-slate-100">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-900 border-slate-700">
                        <SelectItem value="automatic">Automatic</SelectItem>
                        <SelectItem value="middle_of_the_night">
                          Middle of the Night
                        </SelectItem>
                        <SelectItem value="one_seventh">One Seventh</SelectItem>
                        <SelectItem value="angle_based">Angle Based</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="border-t border-slate-800 pt-6">
                    <h3 className="text-white text-lg mb-2">
                      Timing offsets (minutes)
                    </h3>

                    <div className="space-y-3">
                      {offsetsRows.map((p) => (
                        <div
                          key={p}
                          className="flex items-center justify-between gap-4"
                        >
                          <Label className="text-slate-200 capitalize">{p}</Label>
                          <Input
                            type="number"
                            className="w-28 bg-slate-900 border-slate-700 text-slate-100"
                            value={settings.globalOffsets[p]}
                            onChange={(e) =>
                              updateField("globalOffsets", {
                                ...settings.globalOffsets,
                                [p]: Number(e.target.value || 0),
                              })
                            }
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="border-t border-slate-800 pt-6">
                    <div className="flex items-center justify-between rounded-lg border border-slate-700 px-4 py-3">
                      <div>
                        <Label className="text-slate-200">Account enabled</Label>
                        <p className="text-xs text-slate-400">
                          Must be enabled for device playback and schedules.
                        </p>
                      </div>
                      <Switch
                        checked={settings.accountEnabled}
                        onCheckedChange={(v: boolean) =>
                          updateField("accountEnabled", v)
                        }
                      />
                    </div>
                  </div>

                  <div className="border-t border-slate-800 pt-6">
                    <h3 className="text-white text-lg mb-3">Alexa devices</h3>
                    {devices.length === 0 ? (
                      <div className="rounded-lg border border-slate-700 px-4 py-3 text-sm text-slate-400">
                        No linked Alexa devices were returned yet. Reconnect Amazon in onboarding if needed.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {devices.map((device) => {
                          const checked = (settings.selectedAlexaDeviceIds ?? []).includes(device.id);
                          return (
                            <label
                              key={device.id}
                              className={`flex items-center justify-between gap-4 rounded-lg border px-4 py-3 cursor-pointer ${
                                checked
                                  ? "border-emerald-500/50 bg-emerald-500/10"
                                  : "border-slate-700"
                              }`}
                            >
                              <div>
                                <div className="text-slate-100">{device.name}</div>
                                <div className="text-xs text-slate-400">Selected devices can use your Adhan Home Alexa playback flow.</div>
                              </div>
                              <Checkbox
                                checked={checked}
                                onCheckedChange={(value) =>
                                  toggleSelectedDevice(device.id, value === true)
                                }
                              />
                            </label>
                          );
                        })}
                      </div>
                    )}
                    <p className="text-xs text-slate-400 mt-3">
                      These selections are saved in your account and checked by the Alexa skill at runtime.
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  <h2 className="text-white text-lg">Location</h2>

                  <div className="space-y-2">
                    <Label className="text-slate-200">Country or region</Label>
                    <Input
                      className="bg-slate-900 border-slate-700 text-slate-100"
                      value={settings.country}
                      onChange={(e) =>
                        handleLocationFieldChange("country", e.target.value)
                      }
                      placeholder="Example: US, PK, Canada, United Kingdom"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-slate-200">City</Label>
                    <Input
                      className="bg-slate-900 border-slate-700 text-slate-100"
                      value={settings.city}
                      onChange={(e) =>
                        handleLocationFieldChange("city", e.target.value)
                      }
                      placeholder="Example: Chicago, Karachi, London, Dubai"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-slate-200">Timezone</Label>
                    <Input
                      className="bg-slate-900 border-slate-700 text-slate-100"
                      value={settings.timezone}
                      onChange={(e) =>
                        handleLocationFieldChange("timezone", e.target.value)
                      }
                      placeholder="Example: America/Chicago, Asia/Karachi, Europe/London"
                    />
                    <p className="text-xs text-slate-400">
                      Use an IANA timezone name. If left blank, geocoding can supply one on save.
                    </p>
                  </div>

                  <div className="rounded-lg border border-slate-700 px-4 py-3 text-sm">
                    <div className="text-slate-200 mb-1">Saved coordinates</div>
                    <div className="text-slate-400">
                      {settings.latitude != null && settings.longitude != null
                        ? `${settings.latitude.toFixed(6)}, ${settings.longitude.toFixed(6)}`
                        : "Will be refreshed from your country and city when you save settings."}
                    </div>
                  </div>

                  <div className="flex items-center justify-between rounded-lg border border-slate-700 px-4 py-3">
                    <div>
                      <Label className="text-slate-200">Use selected mosque for prayer times</Label>
                      <p className="text-xs text-slate-400">
                        When enabled, the dashboard and prayer API will use saved mosque coordinates whenever they exist.
                      </p>
                      {settings.mosqueName ? (
                        <p className="text-xs text-emerald-400 mt-2">
                          Saved mosque: {settings.mosqueName}
                        </p>
                      ) : (
                        <p className="text-xs text-slate-500 mt-2">
                          No mosque selected yet. The app will fall back to your personal location.
                        </p>
                      )}
                    </div>
                    <Switch
                      checked={settings.useMosqueLocation}
                      onCheckedChange={(v: boolean) =>
                        updateField("useMosqueLocation", v)
                      }
                    />
                  </div>

                  <div className="rounded-lg border border-slate-700 px-4 py-3 text-sm">
                    <div className="text-slate-200 mb-1">Current timing source rule</div>
                    <div className="text-slate-400">
                      {settings.useMosqueLocation
                        ? settings.mosqueLat != null && settings.mosqueLng != null
                          ? "Mosque coordinates will be used."
                          : "Mosque timing is preferred, but it will fall back to your saved personal location until mosque coordinates are available."
                        : "Your saved personal location will be used."}
                    </div>
                  </div>
                </div>
              </div>

              <div className="border-t border-slate-800 pt-6">
                <h2 className="text-white text-lg mb-4">Per-prayer controls</h2>

                {settings.prayerConfigs.map((pc) => (
                  <div
                    key={pc.prayerName}
                    className="rounded-xl border border-slate-800 p-4 mb-4"
                  >
                    <div className="flex items-center justify-between">
                      <h3 className="text-slate-100 capitalize">
                        {pc.prayerName}
                      </h3>
                      <Switch
                        checked={pc.enabled}
                        onCheckedChange={(v: boolean) =>
                          updatePrayerConfig(pc.prayerName, { enabled: v })
                        }
                      />
                    </div>

                    <div className="grid md:grid-cols-3 gap-4 mt-4">
                      <div className="space-y-2">
                        <Label className="text-slate-200">Offset (min)</Label>
                        <Input
                          type="number"
                          className="bg-slate-900 border-slate-700 text-slate-100"
                          value={pc.offsetMin}
                          onChange={(e) =>
                            updatePrayerConfig(pc.prayerName, {
                              offsetMin: Number(e.target.value || 0),
                            })
                          }
                        />
                      </div>

                      <div className="flex items-center justify-between rounded-lg border border-slate-700 px-4 py-3 mt-6 md:mt-0">
                        <div>
                          <Label className="text-slate-200">Quiet window</Label>
                          <p className="text-xs text-slate-400">
                            Don’t play during this time.
                          </p>
                        </div>
                        <Switch
                          checked={pc.quietEnabled}
                          onCheckedChange={(v: boolean) =>
                            updatePrayerConfig(pc.prayerName, {
                              quietEnabled: v,
                            })
                          }
                        />
                      </div>

                      {pc.quietEnabled ? (
                        <div className="grid grid-cols-2 gap-3 md:col-span-3">
                          <div className="space-y-2">
                            <Label className="text-slate-200">From</Label>
                            <Input
                              type="time"
                              className="bg-slate-900 border-slate-700 text-slate-100"
                              value={pc.quietFrom}
                              onChange={(e) =>
                                updatePrayerConfig(pc.prayerName, {
                                  quietFrom: e.target.value,
                                })
                              }
                            />
                          </div>

                          <div className="space-y-2">
                            <Label className="text-slate-200">To</Label>
                            <Input
                              type="time"
                              className="bg-slate-900 border-slate-700 text-slate-100"
                              value={pc.quietTo}
                              onChange={(e) =>
                                updatePrayerConfig(pc.prayerName, {
                                  quietTo: e.target.value,
                                })
                              }
                            />
                          </div>
                        </div>
                      ) : null}
                    </div>

                    <div className="grid md:grid-cols-2 gap-4 mt-4 pt-4 border-t border-slate-800">
                      <div className="space-y-2">
                        <Label className="text-slate-200">Adhan reciter</Label>
                        <Select
                          value={pc.adhanReciterId ?? NONE_VALUE}
                          onValueChange={(v: string) =>
                            updatePrayerConfig(pc.prayerName, {
                              adhanReciterId: v === NONE_VALUE ? null : v,
                            })
                          }
                        >
                          <SelectTrigger className="bg-slate-900 border-slate-700 text-slate-100">
                            <SelectValue placeholder="Select reciter" />
                          </SelectTrigger>
                          <SelectContent className="bg-slate-900 border-slate-700">
                            <SelectItem value={NONE_VALUE}>
                              No reciter selected
                            </SelectItem>
                            {reciters.map((r) => (
                              <SelectItem key={r.id} value={r.id}>
                                {r.name}
                                {r.country ? ` · ${r.country}` : ""}
                                {r.style ? ` · ${r.style}` : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label className="text-slate-200">After Adhan</Label>
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
                          <SelectTrigger className="bg-slate-900 border-slate-700 text-slate-100">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-slate-900 border-slate-700">
                            <SelectItem value="none">None</SelectItem>
                            <SelectItem value="dua">Dua</SelectItem>
                            <SelectItem value="surah">Surah</SelectItem>
                          </SelectContent>
                        </Select>

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
                            <SelectTrigger className="bg-slate-900 border-slate-700 text-slate-100">
                              <SelectValue placeholder="Select Dua" />
                            </SelectTrigger>
                            <SelectContent className="bg-slate-900 border-slate-700">
                              <SelectItem value={NONE_VALUE}>
                                No Dua selected
                              </SelectItem>
                              {duas.map((d) => (
                                <SelectItem key={d.id} value={d.id}>
                                  {d.title}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}

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
                            <SelectTrigger className="bg-slate-900 border-slate-700 text-slate-100">
                              <SelectValue placeholder="Select Surah" />
                            </SelectTrigger>
                            <SelectContent className="bg-slate-900 border-slate-700">
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
                  </div>
                ))}
              </div>

              <div className="border-t border-slate-800 pt-6">
                <h2 className="text-white text-lg mb-2">Tilawat schedules</h2>
                <p className="text-slate-400 text-sm mb-4">
                  Create schedules stored in your account. Alexa routine playback
                  can be layered on top later.
                </p>

                <div className="rounded-xl border border-slate-800 p-4 mb-6">
                  <h3 className="text-slate-100 mb-3">Create schedule</h3>

                  <div className="grid md:grid-cols-4 gap-4">
                    <div className="space-y-2">
                      <Label className="text-slate-200">Time</Label>
                      <Input
                        type="time"
                        className="bg-slate-900 border-slate-700 text-slate-100"
                        value={newTime}
                        onChange={(e) => setNewTime(e.target.value)}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className="text-slate-200">Surah</Label>
                      <Select
                        value={String(newSurah)}
                        onValueChange={(v: string) => setNewSurah(Number(v))}
                      >
                        <SelectTrigger className="bg-slate-900 border-slate-700 text-slate-100">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-slate-900 border-slate-700 max-h-72 overflow-y-auto">
                          {surahs.map((s) => (
                            <SelectItem key={s.number} value={String(s.number)}>
                              {s.number}. {s.nameEnglish}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-slate-200">Device (optional)</Label>
                      <Select
                        value={newDeviceId}
                        onValueChange={(v: string) => setNewDeviceId(v)}
                      >
                        <SelectTrigger className="bg-slate-900 border-slate-700 text-slate-100">
                          <SelectValue placeholder="None" />
                        </SelectTrigger>
                        <SelectContent className="bg-slate-900 border-slate-700">
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
                      <Label className="text-slate-200">Reciter (optional)</Label>
                      <Select
                        value={newReciterId}
                        onValueChange={(v: string) => setNewReciterId(v)}
                      >
                        <SelectTrigger className="bg-slate-900 border-slate-700 text-slate-100">
                          <SelectValue placeholder="Default" />
                        </SelectTrigger>
                        <SelectContent className="bg-slate-900 border-slate-700">
                          <SelectItem value={NONE_VALUE}>Default</SelectItem>
                          {reciters.map((r) => (
                            <SelectItem key={r.id} value={r.id}>
                              {r.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid md:grid-cols-2 gap-4 mt-4">
                    <div className="space-y-2">
                      <Label className="text-slate-200">Title (optional)</Label>
                      <Input
                        className="bg-slate-900 border-slate-700 text-slate-100"
                        value={newTitle}
                        onChange={(e) => setNewTitle(e.target.value)}
                        placeholder="e.g., Morning Tilawat"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className="text-slate-200">Days</Label>
                      <div className="flex flex-wrap gap-2">
                        {DAY_LABELS.map((d, i) => (
                          <button
                            key={d}
                            type="button"
                            className={`px-2 py-1 rounded border text-xs ${
                              newDays[i]
                                ? "border-emerald-500 text-emerald-300"
                                : "border-slate-700 text-slate-300"
                            }`}
                            onClick={() => toggleDay(i)}
                          >
                            {d}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4">
                    <Button
                      onClick={createSchedule}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white"
                    >
                      Add schedule
                    </Button>
                  </div>
                </div>

                <div className="space-y-3">
                  {schedules.length === 0 ? (
                    <p className="text-slate-400 text-sm">No schedules yet.</p>
                  ) : (
                    schedules.map((s) => (
                      <div
                        key={s.id}
                        className="flex items-center justify-between gap-4 rounded-lg border border-slate-800 p-4"
                      >
                        <div>
                          <div className="text-slate-100">
                            {s.payload?.title
                              ? s.payload.title
                              : `Tilawat · Surah ${s.payload.surahNumber}`}{" "}
                            · {s.timeOfDay}
                          </div>
                          <div className="text-xs text-slate-400">
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
                          className="border-slate-700 text-slate-200"
                          onClick={() => deleteSchedule(s.id)}
                        >
                          Delete
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="flex justify-end pt-4">
                <Button
                  onClick={handleSave}
                  disabled={saving}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  {saving ? "Saving…" : "Save settings"}
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
