import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Logo } from "../shared/Logo";
import { ProgressIndicator } from "../shared/ProgressIndicator";
import { Button } from "../ui/button";
import { Label } from "../ui/label";
import { Badge } from "../ui/badge";
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
import {
  apiFetchWithAmazonRepair,
  getStoredAmazonToken,
  subscribeToAmazonAuthChanges,
} from "../../lib/api";
 
type PrayerName = "fajr" | "dhuhr" | "asr" | "maghrib" | "isha";
type AfterType = "none" | "dua" | "surah";
 
type JsonRecord = Record<string, unknown>;
 
type Device = {
  id: string;
  name: string;
  platform?: string;
};
 
type Reciter = {
  id: string;
  name: string;
  country?: string | null;
  style?: string | null;
  type?: string;
  sect?: string | null;
};
 
type DuaOption = {
  id: string;
  title: string;
  tags?: string[];
};
 
type SurahOption = {
  number: number;
  nameEnglish: string;
};
 
type AfterAdhan = {
  type: AfterType;
  payload: JsonRecord | null;
};
 
type PrayerConfig = {
  prayerName: PrayerName;
  adhanReciterId: string | null;
  afterAdhan: AfterAdhan;
};
 
type DeviceResponsePayload = {
  devices?: unknown;
  message?: unknown;
  registrationHint?: unknown;
};
 
type UserSettingsPayload = {
  settings?: JsonRecord;
  prayerConfigs?: unknown;
  accountEnabled?: unknown;
  account_enabled?: unknown;
  selectedAlexaDeviceIds?: unknown;
  selectedDeviceIds?: unknown;
};
 
type OnboardingData = {
  devices?: string[];
  accountEnabled?: boolean;
  prayerConfigs?: unknown;
  prayerSettings?: { sect?: string };
  [key: string]: unknown;
};
 
type Props = {
  onboardingData: OnboardingData;
  setOnboardingData: (next: OnboardingData) => void;
};
 
const PRAYERS: PrayerName[] = ["fajr", "dhuhr", "asr", "maghrib", "isha"];
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
 
function safeParseJson(value: unknown): JsonRecord | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
 
function defaultPrayerConfigs(): PrayerConfig[] {
  return PRAYERS.map((prayerName) => ({
    prayerName,
    adhanReciterId: null,
    afterAdhan: { type: "none", payload: null },
  }));
}
 
function normalizeAfterAdhan(source: unknown): AfterAdhan {
  if (!isRecord(source)) {
    return { type: "none", payload: null };
  }
 
  const nested = source.afterAdhan;
  if (isRecord(nested)) {
    const nestedType =
      nested.type === "dua" || nested.type === "surah" ? nested.type : "none";
    return {
      type: nestedType,
      payload: isRecord(nested.payload) ? nested.payload : null,
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
    const found = incoming.find((item: JsonRecord) => {
      const prayerName =
        asString(item.prayerName)?.toLowerCase() ||
        asString(item.prayer_name)?.toLowerCase() ||
        "";
      return prayerName === base.prayerName;
    });
 
    if (!found) return base;
 
    return {
      prayerName: base.prayerName,
      adhanReciterId:
        asString(found.adhanReciterId) ?? asString(found.adhan_reciter_id),
      afterAdhan: normalizeAfterAdhan(found),
    };
  });
}
 
function normalizeDevices(payload: unknown): Device[] {
  const rawList = Array.isArray(payload)
    ? payload
    : isRecord(payload) && Array.isArray(payload.devices)
    ? payload.devices
    : [];
 
  return rawList
    .filter((item): item is JsonRecord => isRecord(item))
    .map((item: JsonRecord) => ({
      id: asString(item.id) ?? "",
      name: asString(item.name) ?? "",
      platform: asString(item.platform) ?? undefined,
    }))
    .filter((item: Device) => item.id.length > 0 && item.name.length > 0);
}
 
function normalizeReciters(payload: unknown): Reciter[] {
  const rawList = Array.isArray(payload)
    ? payload
    : isRecord(payload) && Array.isArray(payload.reciters)
    ? payload.reciters
    : [];
 
  return rawList
    .filter((item): item is JsonRecord => isRecord(item))
    .map((item: JsonRecord) => ({
      id: asString(item.id) ?? "",
      name: asString(item.name) ?? "",
      country: asString(item.country),
      style: asString(item.style),
      type: asString(item.type) ?? undefined,
      sect: asString(item.sect),
    }))
    .filter((item: Reciter) => item.id.length > 0 && item.name.length > 0);
}
 
function normalizeDuas(payload: unknown): DuaOption[] {
  if (!isRecord(payload) || !Array.isArray(payload.categories)) return [];
 
  const flat: DuaOption[] = [];
 
  for (const category of payload.categories) {
    if (!isRecord(category) || !Array.isArray(category.items)) continue;
 
    for (const item of category.items) {
      if (!isRecord(item)) continue;
 
      const id = asString(item.id) ?? "";
      const title = asString(item.title) ?? "";
      const tags = Array.isArray(item.tags)
        ? item.tags.filter((tag): tag is string => typeof tag === "string")
        : undefined;
 
      if (id && title) {
        flat.push({ id, title, tags });
      }
    }
  }
 
  return flat;
}
 
function normalizeSurahs(payload: unknown): SurahOption[] {
  if (!isRecord(payload) || !Array.isArray(payload.surahs)) return [];
 
  return payload.surahs
    .filter((item): item is JsonRecord => isRecord(item))
    .map((item: JsonRecord) => ({
      number: asNumber(item.number) ?? NaN,
      nameEnglish: asString(item.nameEnglish) ?? "",
    }))
    .filter(
      (item: SurahOption) =>
        Number.isFinite(item.number) &&
        item.number >= 1 &&
        item.nameEnglish.length > 0
    );
}
 
async function saveSettings(payload: JsonRecord) {
  const put = await apiFetchWithAmazonRepair("/api/user/settings", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
  if (put.ok) return put;
 
  return apiFetchWithAmazonRepair("/api/user/settings", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
 
function isAfterAdhanDua(dua: DuaOption) {
  if (dua.id === "after_adhan") return true;
  const tags = Array.isArray(dua.tags) ? dua.tags.join(" ").toLowerCase() : "";
  const title = dua.title.toLowerCase();
  return (
    title.includes("after adhan") ||
    tags.includes("after adhan") ||
    tags.includes("adhan")
  );
}
 
export default function Step5DevicesAdhan({
  onboardingData,
  setOnboardingData,
}: Props) {
  const navigate = useNavigate();
 
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deviceMessage, setDeviceMessage] = useState<string | null>(null);
 
  const [accountEnabled, setAccountEnabled] = useState<boolean>(
    onboardingData.accountEnabled === true
  );
  const [devices, setDevices] = useState<Device[]>([]);
  const [selectedDeviceIds, setSelectedDeviceIds] = useState<string[]>(
    Array.isArray(onboardingData.devices)
      ? onboardingData.devices.filter(
          (id): id is string => typeof id === "string"
        )
      : []
  );
  const [reciters, setReciters] = useState<Reciter[]>([]);
  const [duas, setDuas] = useState<DuaOption[]>([]);
  const [surahs, setSurahs] = useState<SurahOption[]>([]);
  const [prayerConfigs, setPrayerConfigs] = useState<PrayerConfig[]>(
    normalizePrayerConfigs(onboardingData.prayerConfigs)
  );
 
  const afterAdhanDuas = useMemo(() => duas.filter(isAfterAdhanDua), [duas]);
  const recitersSorted = useMemo(
    () => [...reciters].sort((a, b) => a.name.localeCompare(b.name)),
    [reciters]
  );
  const sectLabel = useMemo(() => {
    const sect = String(
      onboardingData?.prayerSettings?.sect || "SUNNI"
    ).toUpperCase();
    return sect === "SHIA" ? "Shia" : "Sunni";
  }, [onboardingData]);
 
  const canContinue = useMemo(() => {
    const anyReciter = prayerConfigs.some((p) => !!p.adhanReciterId);
    const hasValidDeviceSelection =
      devices.length === 0 || selectedDeviceIds.length > 0;
    return accountEnabled && anyReciter && hasValidDeviceSelection && !saving;
  }, [
    accountEnabled,
    prayerConfigs,
    devices.length,
    selectedDeviceIds.length,
    saving,
  ]);
 
  function updatePrayer(prayerName: PrayerName, patch: Partial<PrayerConfig>) {
    setPrayerConfigs((prev) =>
      prev.map((p) => (p.prayerName === prayerName ? { ...p, ...patch } : p))
    );
  }
 
  function toggleSelectedDevice(deviceId: string, checked: boolean) {
    setSelectedDeviceIds((prev) => {
      const next = checked
        ? Array.from(new Set([...prev, deviceId]))
        : prev.filter((id) => id !== deviceId);
      return next;
    });
  }
 
  async function loadAll() {
    setLoading(true);
    setError(null);
 
    const token = getStoredAmazonToken();
    if (!token) {
      setError(
        "Please connect Amazon in Step 2 before configuring devices and Adhan."
      );
      setLoading(false);
      return;
    }
 
    try {
      const [settingsRes, devicesRes, recitersRes, duasRes, surahsRes] =
        await Promise.all([
          apiFetchWithAmazonRepair("/api/user/settings"),
          apiFetchWithAmazonRepair("/api/alexa/devices"),
          apiFetchWithAmazonRepair("/api/library/reciters?type=adhan"),
          apiFetchWithAmazonRepair("/api/duas"),
          apiFetchWithAmazonRepair("/api/quran/surahs"),
        ]);
 
      if (settingsRes.ok) {
        const payloadUnknown: unknown = await settingsRes.json();
        const payload: UserSettingsPayload = isRecord(payloadUnknown)
          ? (payloadUnknown as UserSettingsPayload)
          : {};
 
        const settings = isRecord(payload.settings)
          ? payload.settings
          : isRecord(payloadUnknown)
          ? payloadUnknown
          : {};
 
        const enabledValue =
          asBoolean(settings.accountEnabled) ??
          asBoolean(settings.account_enabled) ??
          asBoolean(payload.accountEnabled) ??
          asBoolean(payload.account_enabled);
 
        setAccountEnabled(enabledValue ?? false);
 
        const selectedDeviceIdsSource = Array.isArray(
          settings.selectedAlexaDeviceIds
        )
          ? settings.selectedAlexaDeviceIds
          : Array.isArray(settings.selectedDeviceIds)
          ? settings.selectedDeviceIds
          : Array.isArray(payload.selectedAlexaDeviceIds)
          ? payload.selectedAlexaDeviceIds
          : payload.selectedDeviceIds;
 
        if (Array.isArray(selectedDeviceIdsSource)) {
          setSelectedDeviceIds(
            selectedDeviceIdsSource.filter(
              (id): id is string =>
                typeof id === "string" && id.trim().length > 0
            )
          );
        }
 
        const configsSource = Array.isArray(settings.prayerConfigs)
          ? settings.prayerConfigs
          : payload.prayerConfigs;
 
        if (Array.isArray(configsSource)) {
          setPrayerConfigs(normalizePrayerConfigs(configsSource));
        }
      }
 
      if (devicesRes.ok) {
        const payloadUnknown = (await devicesRes.json()) as unknown;
        const payload: DeviceResponsePayload = isRecord(payloadUnknown)
          ? (payloadUnknown as DeviceResponsePayload)
          : {};
        setDevices(normalizeDevices(payloadUnknown));
 
        const rawMessage =
          asString(payload.message) ||
          (isRecord(payload.registrationHint)
            ? asString(payload.registrationHint.voiceCommand)
            : null);
 
        setDeviceMessage(rawMessage);
      }
 
      if (recitersRes.ok) {
        const payload = (await recitersRes.json()) as unknown;
        const normalizedReciters = normalizeReciters(payload);
        setReciters(normalizedReciters);
 
        if (normalizedReciters.length === 0) {
          setError(
            "Reciter library is not available right now. Please verify the backend reciter endpoint."
          );
        }
      } else {
        setError(
          "Reciter library is not available right now. Please verify the backend reciter endpoint."
        );
      }
 
      if (duasRes.ok) {
        const payload = (await duasRes.json()) as unknown;
        setDuas(normalizeDuas(payload));
      }
 
      if (surahsRes.ok) {
        const payload = (await surahsRes.json()) as unknown;
        setSurahs(normalizeSurahs(payload));
      }
    } catch (e: unknown) {
      const message =
        e instanceof Error
          ? e.message
          : "Failed to load devices and Adhan settings.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }
 
  useEffect(() => {
    void loadAll();
  }, []);
 
  useEffect(() => {
    return subscribeToAmazonAuthChanges(() => {
      void loadAll();
    });
  }, []);
 
  useEffect(() => {
    if (devices.length === 0) return;
 
    setSelectedDeviceIds((prev) => {
      const filtered = prev.filter((id) =>
        devices.some((device) => device.id === id)
      );
      if (filtered.length > 0) return filtered;
      return devices.map((device) => device.id);
    });
  }, [devices]);
 
  const handleNext = async () => {
    setError(null);
 
    const token = getStoredAmazonToken();
    if (!token) {
      setError("Please connect Amazon in Step 2 before saving.");
      return;
    }
 
    if (!accountEnabled) {
      setError("Please enable the account before continuing.");
      return;
    }
 
    const anyReciter = prayerConfigs.some((p) => !!p.adhanReciterId);
    if (!anyReciter) {
      setError("Please choose at least one Adhan reciter before continuing.");
      return;
    }
 
    if (devices.length > 0 && selectedDeviceIds.length === 0) {
      setError("Please select at least one Alexa device before continuing.");
      return;
    }
 
    setSaving(true);
    try {
      const payload: JsonRecord = {
        accountEnabled,
        selectedAlexaDeviceIds: selectedDeviceIds,
        prayerConfigs: prayerConfigs.map((p) => ({
          prayerName: p.prayerName,
          adhanReciterId: p.adhanReciterId,
          afterAdhan: p.afterAdhan,
        })),
      };
 
      const resp = await saveSettings(payload);
 
      if (!resp.ok) {
        const msg = await resp.text().catch(() => "");
        throw new Error(`Could not save settings (${resp.status}). ${msg}`.trim());
      }
 
      setOnboardingData({
        ...onboardingData,
        devices: selectedDeviceIds,
        accountEnabled,
        prayerConfigs,
      });
 
      navigate("/onboarding/step6");
    } catch (e: unknown) {
      const message =
        e instanceof Error
          ? e.message
          : "Could not save device and Adhan settings.";
      setError(message);
    } finally {
      setSaving(false);
    }
  };
 
  const tabs = useMemo(() => ["Linked Devices", "Adhan per Prayer"], []);
 
  return (
    <div className="min-h-screen bg-slate-950 overscroll-none">
      {/* Sticky Header */}
      <div
        className="sticky top-0 z-20 bg-slate-950/95 backdrop-blur-sm border-b border-slate-800/50"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <div className="max-w-7xl mx-auto px-4 py-4 md:px-6">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <Logo />
            <ProgressIndicator currentStep={5} totalSteps={6} />
          </div>
        </div>
      </div>
 
      <div
        className="max-w-5xl mx-auto px-4 py-8 md:py-12"
        style={{ paddingBottom: "calc(2rem + env(safe-area-inset-bottom))" }}
      >
        {/* Hero Section */}
        <div className="mb-8 md:mb-10">
          <h1 className="text-3xl md:text-4xl font-semibold text-white mb-3">
            Select devices &amp; Adhan
          </h1>
          <p className="text-base md:text-lg text-slate-400 leading-relaxed max-w-2xl">
            Choose which Alexa devices will play the Adhan, and pick your preferred
            reciter for each prayer time.
          </p>
        </div>
 
        {/* Main Content Card */}
        <div className="rounded-3xl border border-slate-800/60 bg-slate-900/40 backdrop-blur-sm p-6 md:p-10">
          {/* Error Alert */}
          {error && (
            <div className="mb-6 rounded-xl border border-red-500/50 bg-red-500/10 px-5 py-4">
              <p className="text-red-300 text-sm leading-relaxed">{error}</p>
            </div>
          )}
 
          {/* Account Enable Toggle */}
          <div className="mb-8 p-6 rounded-2xl border-2 border-slate-700/60 bg-slate-800/30">
            <div className="flex items-center justify-between gap-4">
              <div className="flex-1">
                <div className="text-white font-semibold mb-1">
                  Enable Adhan playback
                </div>
                <p className="text-slate-400 text-sm leading-relaxed">
                  Turn this on to activate automatic Adhan announcements at prayer
                  times on your selected devices.
                </p>
              </div>
              <Switch
                checked={accountEnabled}
                onCheckedChange={(v: boolean) => setAccountEnabled(v)}
                className="data-[state=checked]:bg-emerald-500"
              />
            </div>
          </div>
 
          {/* Info Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
            <div className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-4">
              <div className="flex items-center gap-2 mb-1">
                <div className="h-2 w-2 rounded-full bg-emerald-400" />
                <div className="text-white text-sm font-medium">Prayer times</div>
              </div>
              <div className="text-slate-400 text-xs leading-relaxed">
                Using {sectLabel} calculation method
              </div>
            </div>
            <div className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-4">
              <div className="flex items-center gap-2 mb-1">
                <div className="h-2 w-2 rounded-full bg-emerald-400" />
                <div className="text-white text-sm font-medium">Voice library</div>
              </div>
              <div className="text-slate-400 text-xs leading-relaxed">
                All Adhan voices available
              </div>
            </div>
            <div className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-4">
              <div className="flex items-center gap-2 mb-1">
                <div className="h-2 w-2 rounded-full bg-emerald-400" />
                <div className="text-white text-sm font-medium">After Adhan</div>
              </div>
              <div className="text-slate-400 text-xs leading-relaxed">
                Optional dua or surah playback
              </div>
            </div>
          </div>
 
          {/* Tabs */}
          <Tabs defaultValue={tabs[0]} className="w-full">
            <TabsList className="bg-slate-800/60 border border-slate-700/60 w-full justify-start h-12 p-1 rounded-xl mb-6">
              {tabs.map((tab) => (
                <TabsTrigger
                  key={tab}
                  value={tab}
                  className="flex-1 data-[state=active]:bg-emerald-600 data-[state=active]:text-white rounded-lg transition-all touch-manipulation"
                >
                  {tab}
                </TabsTrigger>
              ))}
            </TabsList>
 
            {/* Tab 1: Linked Devices */}
            <TabsContent value={tabs[0]} className="mt-0">
              <div className="mb-4">
                <h2 className="text-white text-base font-semibold mb-2">
                  Your Alexa devices
                </h2>
                <p className="text-slate-400 text-sm leading-relaxed">
                  Select which devices should announce the Adhan at prayer times.
                </p>
              </div>
 
              {loading ? (
                <div className="flex items-center gap-3 p-6 rounded-xl border border-slate-700/50 bg-slate-800/30">
                  <svg
                    className="w-5 h-5 animate-spin text-slate-400"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  <p className="text-slate-300 text-sm">
                    Loading your linked devices…
                  </p>
                </div>
              ) : devices.length === 0 ? (
                <div className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-6">
                  <p className="text-slate-300 text-sm leading-relaxed">
                    {deviceMessage ||
                      "No linked Alexa devices found. You can continue and manage devices later from Settings."}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {devices.map((device) => {
                    const checked = selectedDeviceIds.includes(device.id);
 
                    return (
                      <label
                        key={device.id}
                        className={`flex items-center gap-4 p-5 rounded-xl border-2 cursor-pointer transition-all touch-manipulation ${
                          checked
                            ? "border-emerald-500/50 bg-emerald-500/10"
                            : "border-slate-700/60 bg-slate-800/40 hover:border-slate-600 active:bg-slate-800"
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
                          <div className="text-white font-medium truncate">
                            {device.name}
                          </div>
                          <div className="text-slate-400 text-sm">
                            {device.platform
                              ? device.platform.toUpperCase()
                              : "ALEXA"}
                          </div>
                        </div>
                        {checked && (
                          <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white">
                            Selected
                          </Badge>
                        )}
                      </label>
                    );
                  })}
                </div>
              )}
 
              <div className="mt-4 rounded-xl border border-slate-700/50 bg-slate-800/30 p-4">
                <div className="flex items-start gap-3">
                  <div className="rounded-lg bg-emerald-500/10 p-2 mt-0.5">
                    <svg
                      className="w-4 h-4 text-emerald-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                  </div>
                  <p className="text-slate-400 text-xs leading-relaxed flex-1">
                    Your device selections are saved to your account so all prayer
                    times use the same devices automatically.
                  </p>
                </div>
              </div>
            </TabsContent>
 
            {/* Tab 2: Adhan per Prayer */}
            <TabsContent value={tabs[1]} className="mt-0">
              <div className="mb-4">
                <h2 className="text-white text-base font-semibold mb-2">
                  Customize each prayer
                </h2>
                <p className="text-slate-400 text-sm leading-relaxed">
                  Choose your preferred Adhan reciter for each prayer, and optionally
                  add a dua or surah to play after.
                </p>
              </div>
 
              {reciters.length === 0 ? (
                <div className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-6">
                  <p className="text-slate-300 text-sm leading-relaxed">
                    Reciters are not available right now. Please verify the backend
                    reciter library endpoint.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {prayerConfigs.map((pc) => (
                    <div
                      key={pc.prayerName}
                      className="rounded-xl border border-slate-700/60 bg-slate-800/30 p-5"
                    >
                      <div className="mb-4">
                        <h3 className="text-white font-semibold capitalize text-lg">
                          {pc.prayerName}
                        </h3>
                      </div>
 
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                        {/* Adhan Reciter */}
                        <div className="space-y-2">
                          <Label className="text-slate-200 text-sm font-medium">
                            Adhan reciter
                          </Label>
                          <Select
                            value={pc.adhanReciterId ?? NONE_VALUE}
                            onValueChange={(value: string) =>
                              updatePrayer(pc.prayerName, {
                                adhanReciterId:
                                  value === NONE_VALUE ? null : value,
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
                              {recitersSorted.map((reciter) => (
                                <SelectItem key={reciter.id} value={reciter.id}>
                                  {reciter.name}
                                  {reciter.sect ? ` · ${reciter.sect}` : ""}
                                  {reciter.country ? ` · ${reciter.country}` : ""}
                                  {reciter.style ? ` · ${reciter.style}` : ""}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <p className="text-xs text-slate-500">
                            All voices available regardless of sect
                          </p>
                        </div>
 
                        {/* After Adhan */}
                        <div className="space-y-2">
                          <Label className="text-slate-200 text-sm font-medium">
                            After Adhan
                          </Label>
                          <Select
                            value={pc.afterAdhan.type}
                            onValueChange={(value: string) =>
                              updatePrayer(pc.prayerName, {
                                afterAdhan: {
                                  type: value as AfterType,
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
 
                          {pc.afterAdhan.type === "dua" && (
                            <Select
                              value={
                                asString(pc.afterAdhan.payload?.duaId) ?? NONE_VALUE
                              }
                              onValueChange={(value: string) =>
                                updatePrayer(pc.prayerName, {
                                  afterAdhan:
                                    value === NONE_VALUE
                                      ? { type: "dua", payload: null }
                                      : {
                                          type: "dua",
                                          payload: { duaId: value },
                                        },
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
                                {afterAdhanDuas.map((dua) => (
                                  <SelectItem key={dua.id} value={dua.id}>
                                    {dua.title}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
 
                          {pc.afterAdhan.type === "surah" && (
                            <Select
                              value={
                                asNumber(pc.afterAdhan.payload?.surahNumber) != null
                                  ? String(
                                      asNumber(pc.afterAdhan.payload?.surahNumber)
                                    )
                                  : NONE_VALUE
                              }
                              onValueChange={(value: string) =>
                                updatePrayer(pc.prayerName, {
                                  afterAdhan:
                                    value === NONE_VALUE
                                      ? { type: "surah", payload: null }
                                      : {
                                          type: "surah",
                                          payload: {
                                            surahNumber: Number(value),
                                          },
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
                                {surahs.map((surah) => (
                                  <SelectItem
                                    key={surah.number}
                                    value={String(surah.number)}
                                  >
                                    {surah.number}. {surah.nameEnglish}
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
              )}
            </TabsContent>
          </Tabs>
 
          {/* Continue Requirements */}
          {!canContinue && (
            <div className="mt-6 rounded-xl border border-amber-500/50 bg-amber-500/10 px-5 py-4">
              <div className="flex items-start gap-3">
                <svg
                  className="w-5 h-5 text-amber-400 mt-0.5"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                    clipRule="evenodd"
                  />
                </svg>
                <div className="flex-1">
                  <div className="text-amber-300 text-sm font-medium mb-1">
                    Before you continue
                  </div>
                  <p className="text-amber-200/90 text-sm leading-relaxed">
                    Please enable Adhan playback and choose at least one reciter for
                    any prayer.
                    {devices.length > 0 &&
                      selectedDeviceIds.length === 0 &&
                      " Also select at least one device."}
                  </p>
                </div>
              </div>
            </div>
          )}
 
          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-3 mt-8">
            <Button
              onClick={() => navigate("/onboarding/step4")}
              variant="outline"
              className="flex-1 border-slate-700 text-slate-300 hover:bg-slate-800 h-11 touch-manipulation active:bg-slate-800"
              disabled={saving}
            >
              Back
            </Button>
            <Button
              onClick={handleNext}
              disabled={!canContinue}
              className="flex-1 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white h-11 font-medium disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation active:opacity-90"
            >
              {saving ? "Saving settings…" : "Continue to summary"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}