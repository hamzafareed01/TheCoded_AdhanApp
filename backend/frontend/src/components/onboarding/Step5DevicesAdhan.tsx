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
  apiFetch,
  apiFetchWithAmazonRepair,
  getStoredAmazonToken,
} from "../../lib/api";

type PrayerName = "fajr" | "dhuhr" | "asr" | "maghrib" | "isha";
type AfterType = "none" | "dua" | "surah";

type JsonRecord = Record<string, unknown>;

type Device = {
  id: string;
  name: string;
  platform?: string;
  family?: string;
  familyLabel?: string;
};

type PlaybackEndpoint = {
  endpointId: string;
  friendlyName: string;
  endpointKind?: string;
  deviceFamily?: string;
  deviceId?: string | null;
  supportsAudio?: boolean;
  supportsFireTv?: boolean;
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

type QuietDownPolicy = {
  enabled: boolean;
  strategy: "lower" | "mute";
  targetVolumePct: number;
  restoreAfter: boolean;
  includeFireTv: boolean;
  mode?: string;
  note?: string | null;
};

type UserSettingsPayload = {
  settings?: JsonRecord;
  prayerConfigs?: unknown;
  accountEnabled?: unknown;
  account_enabled?: unknown;
  selectedAlexaDeviceIds?: unknown;
  selectedAlexaTargetEndpointIds?: unknown;
  selectedDeviceIds?: unknown;
  quietDown?: unknown;
  quietDownPolicy?: unknown;
};

type OnboardingData = {
  devices?: string[];
  accountEnabled?: boolean;
  prayerConfigs?: unknown;
  prayerSettings?: { sect?: string };
  quietDown?: QuietDownPolicy;
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

function normalizeQuietDown(source: unknown): QuietDownPolicy {
  const src = isRecord(source) ? source : {};
  return {
    enabled: src.enabled === true,
    strategy: src.strategy === "mute" ? "mute" : "lower",
    targetVolumePct: Math.min(80, Math.max(5, asNumber(src.targetVolumePct) ?? 20)),
    restoreAfter: src.restoreAfter !== false,
    includeFireTv: src.includeFireTv === true,
    mode: asString(src.mode) ?? undefined,
    note: asString(src.note),
  };
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
      family: asString(item.family) ?? undefined,
      familyLabel: asString(item.familyLabel) ?? undefined,
    }))
    .filter((item: Device) => item.id.length > 0 && item.name.length > 0);
}

function normalizePlaybackEndpoints(payload: unknown): PlaybackEndpoint[] {
  const rawList = Array.isArray(payload)
    ? payload
    : isRecord(payload) && Array.isArray(payload.endpoints)
    ? payload.endpoints
    : [];

  return rawList
    .filter((item): item is JsonRecord => isRecord(item))
    .map((item: JsonRecord) => ({
      endpointId: asString(item.endpointId) ?? "",
      friendlyName: asString(item.friendlyName) ?? "",
      endpointKind: asString(item.endpointKind) ?? undefined,
      deviceFamily: asString(item.deviceFamily) ?? undefined,
      deviceId: asString(item.deviceId),
      supportsAudio: asBoolean(item.supportsAudio) ?? undefined,
      supportsFireTv: asBoolean(item.supportsFireTv) ?? undefined,
    }))
    .filter((item) => item.endpointId.length > 0 && item.friendlyName.length > 0);
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
  return title.includes("after adhan") || tags.includes("after adhan") || tags.includes("adhan");
}

export default function Step5DevicesAdhan({
  onboardingData,
  setOnboardingData,
}: Props) {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [accountEnabled, setAccountEnabled] = useState<boolean>(
    onboardingData.accountEnabled === true
  );
  const [quietDown, setQuietDown] = useState<QuietDownPolicy>(
    normalizeQuietDown(onboardingData.quietDown)
  );
  const [devices, setDevices] = useState<Device[]>([]);
  const [playbackEndpoints, setPlaybackEndpoints] = useState<PlaybackEndpoint[]>([]);
  const [selectedEndpointIds, setSelectedEndpointIds] = useState<string[]>([]);
  const [selectedDeviceIds, setSelectedDeviceIds] = useState<string[]>(
    Array.isArray(onboardingData.devices)
      ? onboardingData.devices.filter((id): id is string => typeof id === "string")
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
    const sect = String(onboardingData?.prayerSettings?.sect || "SUNNI").toUpperCase();
    return sect === "SHIA" ? "Shia" : "Sunni";
  }, [onboardingData]);

  const canContinue = useMemo(() => {
    const anyReciter = prayerConfigs.some((p) => !!p.adhanReciterId);
    const hasValidSelection = playbackEndpoints.length > 0
      ? selectedEndpointIds.length > 0
      : devices.length === 0 || selectedDeviceIds.length > 0;
    return accountEnabled && anyReciter && hasValidSelection && !saving;
  }, [accountEnabled, prayerConfigs, playbackEndpoints.length, selectedEndpointIds.length, devices.length, selectedDeviceIds.length, saving]);

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

  function toggleSelectedEndpoint(endpointId: string, checked: boolean) {
    setSelectedEndpointIds((prev) => {
      const next = checked
        ? Array.from(new Set([...prev, endpointId]))
        : prev.filter((id) => id !== endpointId);
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
          apiFetch("/api/library/reciters?type=adhan"),
          apiFetch("/api/duas"),
          apiFetch("/api/quran/surahs"),
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

        const selectedDeviceIdsSource = Array.isArray(settings.selectedAlexaDeviceIds)
          ? settings.selectedAlexaDeviceIds
          : Array.isArray(settings.selectedDeviceIds)
          ? settings.selectedDeviceIds
          : Array.isArray(payload.selectedAlexaDeviceIds)
          ? payload.selectedAlexaDeviceIds
          : payload.selectedDeviceIds;

        if (Array.isArray(selectedDeviceIdsSource)) {
          setSelectedDeviceIds(
            selectedDeviceIdsSource.filter(
              (id): id is string => typeof id === "string" && id.trim().length > 0
            )
          );
        }

        const selectedEndpointIdsSource = Array.isArray((settings as JsonRecord).selectedAlexaTargetEndpointIds)
          ? (settings as JsonRecord).selectedAlexaTargetEndpointIds
          : Array.isArray((payload as JsonRecord).selectedAlexaTargetEndpointIds)
          ? (payload as JsonRecord).selectedAlexaTargetEndpointIds
          : [];

        if (Array.isArray(selectedEndpointIdsSource)) {
          setSelectedEndpointIds(
            selectedEndpointIdsSource.filter(
              (id): id is string => typeof id === "string" && id.trim().length > 0
            )
          );
        }

        const configsSource = Array.isArray(settings.prayerConfigs)
          ? settings.prayerConfigs
          : payload.prayerConfigs;

        if (Array.isArray(configsSource)) {
          setPrayerConfigs(normalizePrayerConfigs(configsSource));
        }

        const quietDownSource =
          (isRecord(settings.quietDown) && settings.quietDown) ||
          (isRecord(settings.quietDownPolicy) && settings.quietDownPolicy) ||
          (isRecord(payload.quietDown) && payload.quietDown) ||
          (isRecord(payload.quietDownPolicy) && payload.quietDownPolicy) ||
          null;

        if (quietDownSource) {
          setQuietDown(normalizeQuietDown(quietDownSource));
        }
      }

      if (devicesRes.ok) {
        const payload = (await devicesRes.json()) as unknown;
        setDevices(normalizeDevices(payload));
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
    if (playbackEndpoints.length === 0) return;

    setSelectedEndpointIds((prev) => {
      const filtered = prev.filter((id) => playbackEndpoints.some((endpoint) => endpoint.endpointId === id));
      if (filtered.length > 0) return filtered;
      return playbackEndpoints.map((endpoint) => endpoint.endpointId);
    });
  }, [playbackEndpoints]);

  useEffect(() => {
    if (devices.length === 0) return;

    setSelectedDeviceIds((prev) => {
      const filtered = prev.filter((id) => devices.some((device) => device.id === id));
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

    if (playbackEndpoints.length > 0 && selectedEndpointIds.length === 0) {
      setError("Please select at least one playback target before continuing.");
      return;
    }

    if (playbackEndpoints.length === 0 && devices.length > 0 && selectedDeviceIds.length === 0) {
      setError("Please select at least one Alexa device before continuing.");
      return;
    }

    setSaving(true);
    try {
      const payload: JsonRecord = {
        accountEnabled,
        selectedAlexaTargetEndpointIds: selectedEndpointIds,
        selectedAlexaDeviceIds: selectedDeviceIds,
        quietDown,
        quietDownPolicy: quietDown,
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
        selectedAlexaTargetEndpointIds: selectedEndpointIds,
        accountEnabled,
        prayerConfigs,
        quietDown,
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
    <div className="min-h-screen bg-slate-950 py-8 px-4">
      <div className="max-w-5xl mx-auto">
        <Logo className="mb-8" />
        <ProgressIndicator currentStep={5} totalSteps={6} />

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 md:p-12">
          <div className="flex items-center justify-between gap-4 mb-4">
            <h1 className="text-white text-2xl font-semibold">
              Devices &amp; Adhan
            </h1>
            <Badge
              variant="outline"
              className="border-emerald-500/30 text-emerald-400"
            >
              Step 5 of 6
            </Badge>
          </div>

          <p className="text-slate-300 mb-6">
            Enable your account, review linked Alexa devices, and set Adhan plus
            after-Adhan actions for each prayer.
          </p>

          <div className="grid md:grid-cols-3 gap-4 mb-6">
            <div className="rounded-xl border border-slate-700 bg-slate-800/40 px-4 py-3">
              <div className="text-white text-sm font-medium">Current timing mode</div>
              <div className="text-slate-400 text-xs mt-1">
                {sectLabel} calculation mode will be used for prayer timings.
              </div>
            </div>
            <div className="rounded-xl border border-slate-700 bg-slate-800/40 px-4 py-3">
              <div className="text-white text-sm font-medium">Voice library</div>
              <div className="text-slate-400 text-xs mt-1">
                Sunni and Shia Adhan voices remain available to both sects.
              </div>
            </div>
            <div className="rounded-xl border border-slate-700 bg-slate-800/40 px-4 py-3">
              <div className="text-white text-sm font-medium">After Adhan audio</div>
              <div className="text-slate-400 text-xs mt-1">
                Only the After Adhan dua is offered here for playback.
              </div>
            </div>
          </div>

          {error && (
            <div className="mb-6 text-sm text-red-400 bg-red-950/40 border border-red-900 rounded-md px-3 py-2">
              {error}
            </div>
          )}

          <div className="mb-8 p-6 bg-slate-800/50 rounded-xl border border-slate-700">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-white">Enable account</Label>
                <p className="text-slate-400 text-sm mt-1">
                  Required to activate backend-backed playback and scheduling.
                </p>
              </div>
              <Switch
                checked={accountEnabled}
                onCheckedChange={(v: boolean) => setAccountEnabled(v)}
              />
            </div>
          </div>

          <div className="mb-8 p-6 bg-slate-800/50 rounded-xl border border-slate-700 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <Label className="text-white">Quiet down during Adhan</Label>
                <p className="text-slate-400 text-sm mt-1">
                  Save how AdhanCast should quiet selected household devices during the Adhan window.
                </p>
              </div>
              <Switch
                checked={quietDown.enabled}
                onCheckedChange={(v: boolean) =>
                  setQuietDown((prev) => ({ ...prev, enabled: v }))
                }
              />
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-slate-200">Quiet-down action</Label>
                <Select
                  value={quietDown.strategy}
                  onValueChange={(value: string) =>
                    setQuietDown((prev) => ({
                      ...prev,
                      strategy: value === "mute" ? "mute" : "lower",
                    }))
                  }
                >
                  <SelectTrigger className="bg-slate-900 border-slate-700 text-slate-100">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-900 border-slate-700">
                    <SelectItem value="lower">Lower volume</SelectItem>
                    <SelectItem value="mute">Mute</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-slate-200">Target volume</Label>
                <Select
                  value={String(quietDown.targetVolumePct)}
                  onValueChange={(value: string) =>
                    setQuietDown((prev) => ({
                      ...prev,
                      targetVolumePct: Math.min(80, Math.max(5, Number(value) || 20)),
                    }))
                  }
                >
                  <SelectTrigger className="bg-slate-900 border-slate-700 text-slate-100">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-900 border-slate-700">
                    <SelectItem value="10">10%</SelectItem>
                    <SelectItem value="20">20%</SelectItem>
                    <SelectItem value="30">30%</SelectItem>
                    <SelectItem value="40">40%</SelectItem>
                    <SelectItem value="50">50%</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <label className="flex items-center justify-between gap-4 rounded-lg border border-slate-700 bg-slate-900/60 px-4 py-3">
                <div>
                  <div className="text-white text-sm">Restore after Adhan</div>
                  <div className="text-slate-400 text-xs mt-1">
                    Return supported devices to their previous state after playback.
                  </div>
                </div>
                <Switch
                  checked={quietDown.restoreAfter}
                  onCheckedChange={(v: boolean) =>
                    setQuietDown((prev) => ({ ...prev, restoreAfter: v }))
                  }
                />
              </label>

              <label className="flex items-center justify-between gap-4 rounded-lg border border-slate-700 bg-slate-900/60 px-4 py-3">
                <div>
                  <div className="text-white text-sm">Include Fire TV devices</div>
                  <div className="text-slate-400 text-xs mt-1">
                    Keep Fire TV devices inside the saved quiet-down policy.
                  </div>
                </div>
                <Switch
                  checked={quietDown.includeFireTv}
                  onCheckedChange={(v: boolean) =>
                    setQuietDown((prev) => ({ ...prev, includeFireTv: v }))
                  }
                />
              </label>
            </div>

            <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-xs text-amber-200">
              {quietDown.note ||
                "AdhanCast will save this quiet-down policy now. Actual device-wide volume control still depends on separate Alexa smart-home or video device integration for the selected hardware."}
            </div>
          </div>

          <Tabs defaultValue={tabs[0]} className="w-full">
            <TabsList className="bg-slate-800 border-slate-700 w-full justify-start overflow-x-auto flex-nowrap">
              {tabs.map((tab) => (
                <TabsTrigger
                  key={tab}
                  value={tab}
                  className="data-[state=active]:bg-emerald-600 data-[state=active]:text-white"
                >
                  {tab}
                </TabsTrigger>
              ))}
            </TabsList>

            <TabsContent value={tabs[0]} className="mt-4">
              {playbackEndpoints.length > 0 ? (
                <div className="mb-5 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                  <div className="text-white text-sm font-medium mb-2">Playback targets</div>
                  <p className="text-slate-300 text-sm mb-3">
                    AdhanCast now builds household playback targets from recently seen Alexa devices and logical groups.
                  </p>
                  <div className="space-y-2">
                    {playbackEndpoints.map((endpoint) => {
                      const checked = selectedEndpointIds.includes(endpoint.endpointId);
                      return (
                        <label key={endpoint.endpointId} className={`flex items-center gap-3 rounded-lg border px-3 py-3 cursor-pointer ${checked ? "border-emerald-500/50 bg-emerald-500/10" : "border-slate-700 bg-slate-800/40"}`}>
                          <Checkbox checked={checked} onCheckedChange={(value) => toggleSelectedEndpoint(endpoint.endpointId, value === true)} />
                          <div className="flex-1 min-w-0">
                            <div className="text-slate-100 text-sm font-medium">{endpoint.friendlyName}</div>
                            <div className="text-slate-400 text-xs mt-1">{endpoint.endpointKind === "group" ? "Logical playback group" : "Device-backed playback target"}{endpoint.supportsFireTv ? " · Includes Fire TV support" : ""}</div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ) : null}
              {loading ? (
                <p className="text-slate-400 text-sm">Loading linked devices…</p>
              ) : devices.length === 0 ? (
                <p className="text-slate-300 text-sm">
                  No linked Alexa devices were returned yet. You can continue and
                  link or review device usage later.
                </p>
              ) : (
                <div className="space-y-3">
                  {devices.map((device) => {
                    const checked = selectedDeviceIds.includes(device.id);

                    return (
                      <label
                        key={device.id}
                        className={`flex items-center gap-4 p-4 bg-slate-800/50 rounded-lg border cursor-pointer transition-colors ${
                          checked
                            ? "border-emerald-500/50 bg-emerald-500/10"
                            : "border-slate-700"
                        }`}
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(value) =>
                            toggleSelectedDevice(device.id, value === true)
                          }
                        />
                        <div className="flex-1">
                          <div className="text-white">{device.name}</div>
                          <div className="text-slate-400 text-sm">
                            {device.platform ? device.platform.toUpperCase() : "ALEXA"}
                            {device.family ? ` · ${device.family}` : ""}
                          </div>
                        </div>
                        <Badge variant="secondary">
                          {checked ? "Selected" : "Linked"}
                        </Badge>
                      </label>
                    );
                  })}
                </div>
              )}

              <p className="text-xs text-slate-400 mt-4">
                Selected devices are saved to your backend profile so later
                playback routing can use the same stored targets consistently.
              </p>
            </TabsContent>

            <TabsContent value={tabs[1]} className="mt-4">
              {reciters.length === 0 ? (
                <p className="text-slate-300 text-sm">
                  Reciters are not available right now. Please verify the backend
                  reciter library endpoint.
                </p>
              ) : (
                <div className="space-y-4">
                  {prayerConfigs.map((pc) => (
                    <div
                      key={pc.prayerName}
                      className="rounded-xl border border-slate-800 p-4"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-slate-100 capitalize">
                          {pc.prayerName}
                        </h3>
                      </div>

                      <div className="grid md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label className="text-slate-200">Adhan reciter</Label>
                          <Select
                            value={pc.adhanReciterId ?? NONE_VALUE}
                            onValueChange={(value: string) =>
                              updatePrayer(pc.prayerName, {
                                adhanReciterId:
                                  value === NONE_VALUE ? null : value,
                              })
                            }
                          >
                            <SelectTrigger className="bg-slate-900 border-slate-700 text-slate-100">
                              <SelectValue placeholder="Select reciter" />
                            </SelectTrigger>
                            <SelectContent className="bg-slate-900 border-slate-700 max-h-80">
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
                            Voice choice is shared across Sunni and Shia timing modes.
                          </p>
                        </div>

                        <div className="space-y-2">
                          <Label className="text-slate-200">After Adhan</Label>
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
                              value={asString(pc.afterAdhan.payload?.duaId) ?? NONE_VALUE}
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
                              <SelectTrigger className="bg-slate-900 border-slate-700 text-slate-100">
                                <SelectValue placeholder="Select Dua" />
                              </SelectTrigger>
                              <SelectContent className="bg-slate-900 border-slate-700">
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
                                  ? String(asNumber(pc.afterAdhan.payload?.surahNumber))
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
                              <SelectTrigger className="bg-slate-900 border-slate-700 text-slate-100">
                                <SelectValue placeholder="Select Surah" />
                              </SelectTrigger>
                              <SelectContent className="bg-slate-900 border-slate-700">
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

          <div className="flex gap-4 mt-8">
            <Button
              onClick={() => navigate("/onboarding/step4")}
              variant="outline"
              className="flex-1 border-slate-700 text-slate-300 hover:bg-slate-800"
              disabled={saving}
            >
              Back
            </Button>
            <Button
              onClick={handleNext}
              disabled={!canContinue}
              className="flex-1 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white"
            >
              {saving ? "Saving…" : "Save & Continue"}
            </Button>
          </div>

          {!canContinue && (
            <p className="text-xs text-slate-400 mt-3">
              To continue, enable the account and choose at least one Adhan reciter.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
