import React from 'react';
import {
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from "react";
import { Logo } from "../shared/Logo";
import { Navigation } from "../shared/Navigation";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Switch } from "../ui/switch";
import { Badge } from "../ui/badge";
import {
  apiFetch,
  getStoredAmazonToken,
  subscribeToAmazonAuthChanges,
} from "../../lib/api";
import {
  MapPin,
  Search,
  CheckCircle2,
  Navigation2,
  Building2,
  LocateFixed,
} from "lucide-react";

type Sect = "SUNNI" | "SHIA";
type SectFilter = "AUTO" | "ALL" | Sect;

type QuietHours = {
  enabled: boolean;
  from: string;
  to: string;
  muteFajr: boolean;
};

type UserSettings = {
  userId?: string;
  sect: Sect;
  language: string;
  madhhab: string;
  calculationMethod: string;
  highLatitudeMethod: string;
  country: string;
  city: string;
  timezone: string;
  useMosqueLocation: boolean;
  mosqueId: string | null;
  quietHours: QuietHours;
  latitude?: number | null;
  longitude?: number | null;
  mosqueName?: string | null;
  mosqueAddress?: string | null;
  mosqueLat?: number | null;
  mosqueLng?: number | null;
};

type Mosque = {
  placeId: string;
  name: string;
  address?: string;
  location?: { lat?: number; lng?: number };
  sect?: "SUNNI" | "SHIA" | "UNKNOWN";
  sectConfidence?: string;
};

type MosqueSelectorProps = {
  onboardingData: Record<string, unknown>;
  setOnboardingData: (data: Record<string, unknown>) => void;
};

type SettingsResponse =
  | UserSettings
  | { settings?: Partial<UserSettings>; userKey?: string };

type JsonRecord = Record<string, unknown>;

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
  const raw = String(value ?? "").trim();
  return raw || "Etc/UTC";
}

function normalizeSettings(payload: unknown): UserSettings {
  const root = isRecord(payload) ? (payload as SettingsResponse) : {};
  const src =
    isRecord((root as { settings?: unknown }).settings)
      ? ((root as { settings?: Record<string, unknown> }).settings as Record<string, unknown>)
      : (root as Record<string, unknown>);

  const quietSource = isRecord(src.quietHours) ? src.quietHours : {};
  const sect: Sect = src.sect === "SHIA" || src.shia === true ? "SHIA" : "SUNNI";

  return {
    userId: asString((root as Record<string, unknown>).userKey) ?? asString(src.userId) ?? undefined,
    sect,
    language: asString(src.language) ?? "en",
    madhhab: asString(src.madhhab) ?? "hanafi",
    calculationMethod: asString(src.calculationMethod) ?? asString(src.calculation_method) ?? (sect === "SHIA" ? "jafari" : "isna"),
    highLatitudeMethod: asString(src.highLatitudeMethod) ?? asString(src.high_latitude_method) ?? "automatic",
    country: normalizeCountry(src.country),
    city: normalizeCity(src.city),
    timezone: normalizeTimezone(src.timezone),
    useMosqueLocation: asBoolean(src.useMosqueLocation) ?? false,
    mosqueId: asString(src.mosqueId),
    quietHours: {
      enabled: asBoolean(quietSource.enabled) ?? false,
      from: asString(quietSource.from) ?? "22:00",
      to: asString(quietSource.to) ?? "07:00",
      muteFajr: asBoolean(quietSource.muteFajr) ?? true,
    },
    latitude: asNumber(src.latitude),
    longitude: asNumber(src.longitude),
    mosqueName: asString(src.mosqueName),
    mosqueAddress: asString(src.mosqueAddress),
    mosqueLat: asNumber(src.mosqueLat),
    mosqueLng: asNumber(src.mosqueLng),
  };
}

function normalizeMosques(payload: unknown): Mosque[] {
  if (!isRecord(payload) || !Array.isArray(payload.mosques)) return [];
  return payload.mosques
    .filter((item): item is JsonRecord => isRecord(item))
    .map((item) => {
      const sect: Mosque["sect"] =
        item.sect === "SUNNI" || item.sect === "SHIA" || item.sect === "UNKNOWN"
          ? item.sect
          : "UNKNOWN";
      return {
        placeId: asString(item.placeId) ?? "",
        name: asString(item.name) ?? "",
        address: asString(item.address) ?? undefined,
        sect,
        sectConfidence: asString(item.sectConfidence) ?? undefined,
        location: isRecord(item.location)
          ? { lat: asNumber(item.location.lat) ?? undefined, lng: asNumber(item.location.lng) ?? undefined }
          : undefined,
      };
    })
    .filter((m) => m.placeId && m.name);
}

function norm(s?: string) {
  return (s ?? "").trim().toLowerCase().replace(/\s+/g, " ").replace(/,+/g, ",").replace(/,\s+/g, ", ");
}

function isSameLocationQuery(query: string, settings: UserSettings) {
  const q = norm(query);
  const city = norm(settings.city);
  if (!q) return true;
  if (q === city) return true;
  if (q.startsWith(`${city},`)) return true;
  return false;
}

function buildDirectionsUrl(mosque: Mosque, settings: UserSettings | null): string {
  const origin =
    typeof settings?.latitude === "number" && typeof settings?.longitude === "number"
      ? `${settings.latitude},${settings.longitude}`
      : "";
  const destinationCoords =
    typeof mosque.location?.lat === "number" && typeof mosque.location?.lng === "number"
      ? `${mosque.location.lat},${mosque.location.lng}`
      : "";
  const params = new URLSearchParams();
  params.set("api", "1");
  params.set("travelmode", "driving");
  if (origin) params.set("origin", origin);
  if (destinationCoords) params.set("destination", destinationCoords);
  else params.set("destination", mosque.address || mosque.name);
  if (mosque.placeId) params.set("destination_place_id", mosque.placeId);
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

function getSectBadgeClass(sect?: string) {
  if (sect === "SHIA") return "bg-violet-500/15 text-violet-200 border-violet-500/30";
  if (sect === "SUNNI") return "bg-cyan-500/15 text-cyan-200 border-cyan-500/30";
  return "bg-slate-800 text-slate-300 border-slate-700";
}

function getEffectiveSectFilter(filter: SectFilter, settings: UserSettings | null): SectFilter {
  if (filter !== "AUTO") return filter;
  return settings?.sect || "SUNNI";
}

// ─── Iqamah Times Editor ─────────────────────────────────────────────────────

const PRAYERS_LIST = ["fajr", "dhuhr", "asr", "maghrib", "isha"] as const;

function IqamahTimesEditor({ mosqueName, mosqueId }: { mosqueName: string; mosqueId: string | null }) {
  const [times, setTimes] = React.useState<Record<string, string>>({
    fajr: "", dhuhr: "", asr: "", maghrib: "", isha: "",
  });
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState(false);

  React.useEffect(() => {
    if (!mosqueId) return;
    apiFetch(`/api/mosque/iqamah-times?mosqueId=${encodeURIComponent(mosqueId)}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.times) setTimes((prev) => ({ ...prev, ...data.times }));
      })
      .catch(() => {});
  }, [mosqueId]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiFetch("/api/mosque/iqamah-times", {
        method: "POST",
        body: JSON.stringify({ mosqueId, mosqueName, times }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch { /* ignore */ } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {PRAYERS_LIST.map((prayer) => (
          <div key={prayer}>
            <label className="text-slate-300 text-xs font-medium capitalize mb-1 block">{prayer}</label>
            <input
              type="time"
              value={times[prayer] ?? ""}
              onChange={(e) => setTimes((prev) => ({ ...prev, [prayer]: e.target.value }))}
              className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600 touch-manipulation"
            />
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between gap-3 pt-1">
        <p className="text-slate-500 text-xs leading-relaxed">
          Leave blank for calculated times. Only filled prayers will be overridden.
        </p>
        <Button
          onClick={handleSave}
          disabled={saving}
          className="bg-emerald-600 hover:bg-emerald-700 text-white min-h-[44px] touch-manipulation flex-shrink-0"
        >
          {saved ? "Saved ✓" : saving ? "Saving…" : "Save times"}
        </Button>
      </div>
    </div>
  );
}

export default function MosqueSelector({ onboardingData, setOnboardingData }: MosqueSelectorProps) {
  const [hasAmazonToken, setHasAmazonToken] = useState<boolean>(!!getStoredAmazonToken());
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [mosques, setMosques] = useState<Mosque[]>([]);
  const [mosquesLoading, setMosquesLoading] = useState(false);
  const [mosquesError, setMosquesError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedMosqueId, setSelectedMosqueId] = useState<string | null>(null);
  const [sectFilter, setSectFilter] = useState<SectFilter>("AUTO");
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onboardingCityLabel = useMemo(() => {
    if (!settings) return "";
    return `${settings.city}, ${settings.country}`;
  }, [settings]);

  const effectiveSect = useMemo(
    () => getEffectiveSectFilter(sectFilter, settings),
    [sectFilter, settings]
  );

  const selectedMosque = useMemo(
    () => mosques.find((m) => m.placeId === selectedMosqueId) ?? null,
    [mosques, selectedMosqueId]
  );

  useEffect(() => {
    return subscribeToAmazonAuthChanges(() => {
      setHasAmazonToken(!!getStoredAmazonToken());
    });
  }, []);

  async function refreshSettings() {
    const res = await apiFetch("/api/user/settings");
    if (!res.ok) {
      if (res.status === 401) throw new Error("Your Amazon session expired. Please reconnect Amazon.");
      throw new Error(`Failed to load settings (${res.status})`);
    }
    const json = await res.json();
    const normalized = normalizeSettings(json);
    setSettings(normalized);
    setSelectedMosqueId(normalized.mosqueId ?? null);
    if (!searchQuery.trim()) setSearchQuery(normalized.city);
    return normalized;
  }

  useEffect(() => {
    const load = async () => {
      try {
        if (!hasAmazonToken) {
          setSettings(null);
          setError("Please connect Amazon in onboarding step 2 before choosing a mosque.");
          return;
        }
        setError(null);
        const loadedSettings = await refreshSettings();
        if (loadedSettings.city) setSearchQuery(loadedSettings.city);
      } catch (err) {
        console.error(err);
        setError(err instanceof Error ? err.message : "Unable to load settings from server.");
      }
    };
    void load();
  }, [hasAmazonToken]);

  const handleSearchInputChange = (e: ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value);

  const openDirections = (mosque: Mosque) => {
    window.open(buildDirectionsUrl(mosque, settings), "_blank", "noopener,noreferrer");
  };

  const fetchMosques = async (queryOverride?: string) => {
    if (!settings) return;
    const rawQuery = queryOverride?.trim() || searchQuery.trim() || settings.city.trim() || "";
    if (!rawQuery) {
      setMosquesError("Please enter a city or mosque name.");
      setMosques([]);
      return;
    }
    const sameAsOnboarding = isSameLocationQuery(rawQuery, settings);
    try {
      setMosquesLoading(true);
      setMosquesError(null);
      const params = new URLSearchParams();
      params.set("query", rawQuery);
      params.set("country", settings.country || "US");
      params.set("radiusKm", "25");
      params.set("bias", sameAsOnboarding ? "user" : "none");
      params.set("sect", effectiveSect);
      const res = await apiFetch(`/api/mosques?${params.toString()}`);
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `Failed to load mosques (${res.status})`);
      }
      const json = await res.json();
      const normalized = normalizeMosques(json);
      setMosques(normalized);
      if (normalized.length === 0) {
        setMosquesError(
          effectiveSect === "SHIA"
            ? "No Shia-focused mosque results matched this search. Try a nearby area or a mosque name."
            : "No mosques found for this search."
        );
      }
    } catch (err) {
      console.error(err);
      setMosquesError(err instanceof Error ? err.message : "Unable to load mosques.");
      setMosques([]);
    } finally {
      setMosquesLoading(false);
    }
  };

  const handleSearchKeyDown = async (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") { e.preventDefault(); await fetchMosques(searchQuery); }
  };

  const handleTimingPreferenceChange = async (checked: boolean) => {
    if (!settings) return;
    try {
      setSaving(true);
      setError(null);
      setSaveMessage(null);
      const res = await apiFetch("/api/user/settings", {
        method: "POST",
        body: JSON.stringify({ useMosqueLocation: checked }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || "Failed to save timing preference");
      }
      const updatedSettings = await refreshSettings();
      setOnboardingData({
        ...onboardingData,
        location: {
          ...(isRecord(onboardingData.location) ? onboardingData.location : {}),
          country: updatedSettings.country,
          city: updatedSettings.city,
          timezone: updatedSettings.timezone,
          useMosqueLocation: updatedSettings.useMosqueLocation,
        },
      });
      setSaveMessage(
        checked
          ? "Mosque timing saved. Dashboard and Calendar now use your mosque as the primary source."
          : "Personal location timing saved."
      );
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Could not save timing preference.");
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (!selectedMosqueId) { setError("Please select a mosque first."); setSaveMessage(null); return; }
    if (!settings) return;
    try {
      setSaving(true);
      setError(null);
      setSaveMessage(null);
      const mosqueToSave =
        selectedMosque ??
        (settings.mosqueId === selectedMosqueId
          ? {
              placeId: settings.mosqueId,
              name: settings.mosqueName || "Selected mosque",
              address: settings.mosqueAddress || undefined,
              sect: "UNKNOWN" as const,
              location:
                typeof settings.mosqueLat === "number" && typeof settings.mosqueLng === "number"
                  ? { lat: settings.mosqueLat, lng: settings.mosqueLng }
                  : undefined,
            }
          : null);

      const payload: Record<string, unknown> = {
        mosqueId: selectedMosqueId,
        mosqueName: mosqueToSave?.name ?? null,
        mosqueAddress: mosqueToSave?.address ?? null,
        mosqueLat: mosqueToSave?.location?.lat ?? null,
        mosqueLng: mosqueToSave?.location?.lng ?? null,
        useMosqueLocation: settings.useMosqueLocation,
      };
      const res = await apiFetch("/api/user/settings", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || "Failed to save mosque selection");
      }
      const updatedSettings = await refreshSettings();
      setOnboardingData({
        ...onboardingData,
        mosque: mosqueToSave
          ? { id: mosqueToSave.placeId, name: mosqueToSave.name, address: mosqueToSave.address ?? null, location: mosqueToSave.location ?? null }
          : { id: selectedMosqueId },
        location: {
          ...(isRecord(onboardingData.location) ? onboardingData.location : {}),
          city: updatedSettings.city,
          country: updatedSettings.country,
          timezone: updatedSettings.timezone,
          useMosqueLocation: updatedSettings.useMosqueLocation,
        },
      });
      setSaveMessage(
        updatedSettings.useMosqueLocation
          ? "Mosque saved. Prayer times now follow this mosque across Dashboard, Calendar, and Settings."
          : "Mosque saved. Enable mosque timing above to use it as the primary source."
      );
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Could not save mosque.");
    } finally {
      setSaving(false);
    }
  };

  const currentTimingMode = settings?.useMosqueLocation
    ? settings?.mosqueName || "Mosque timing enabled"
    : "Personal location timing";

  return (
    <div className="min-h-screen bg-slate-950 overscroll-none" style={{ paddingTop: "env(safe-area-inset-top)" }}>
      <div className="sticky top-0 z-20 bg-slate-950/95 backdrop-blur-sm border-b border-slate-800/50">
        <div className="max-w-7xl mx-auto px-4 py-4 md:px-6">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <Logo />
            <Navigation />
          </div>
        </div>
      </div>

      <div
        className="max-w-7xl mx-auto px-4 py-6 md:px-6"
        style={{ paddingBottom: "calc(2rem + env(safe-area-inset-bottom))" }}
      >
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-5">
          <div>
            <h1 className="text-white text-xl font-semibold mb-1">Choose your mosque</h1>
            <p className="text-slate-400 text-sm">
              Select a mosque to use its exact coordinates for prayer times. Your city location stays as the fallback.
            </p>
          </div>

          {settings && (
            <div className="grid md:grid-cols-3 gap-3">
              <div className="rounded-2xl border border-slate-800 bg-slate-950/50 px-4 py-4">
                <div className="flex items-center gap-2 text-slate-200 mb-2">
                  <LocateFixed className="w-4 h-4 text-cyan-400" />
                  Personal location
                </div>
                <div className="text-sm text-slate-300">{onboardingCityLabel}</div>
                <div className="text-xs text-slate-500 mt-1">{settings.timezone}</div>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-950/50 px-4 py-4">
                <div className="flex items-center gap-2 text-slate-200 mb-2">
                  <Building2 className="w-4 h-4 text-emerald-400" />
                  Saved mosque
                </div>
                <div className="text-sm text-slate-300">{settings.mosqueName || "No mosque selected yet"}</div>
                <div className="text-xs text-slate-500 mt-1">{settings.mosqueAddress || "Search and save a mosque below."}</div>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-950/50 px-4 py-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-slate-200 text-sm mb-1">Use mosque for prayer times</div>
                    <div className="text-xs text-slate-500">Source: {currentTimingMode}</div>
                  </div>
                  <Switch
                    checked={settings.useMosqueLocation}
                    disabled={saving}
                    onCheckedChange={(checked: boolean) => {
                      setSettings((prev) => (prev ? { ...prev, useMosqueLocation: checked } : prev));
                      void handleTimingPreferenceChange(checked);
                    }}
                  />
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="text-sm text-red-400 bg-red-950/40 border border-red-900 rounded-xl px-4 py-3">
              {error}
            </div>
          )}
          {saveMessage && (
            <div className="text-sm text-emerald-400 bg-emerald-950/40 border border-emerald-900 rounded-xl px-4 py-3">
              {saveMessage}
            </div>
          )}

          {!settings ? (
            <p className="text-slate-400 text-sm">Loading settings…</p>
          ) : (
            <>
              {/* Search controls */}
              <div className="space-y-3">
                <Label className="text-slate-200">Search mosques</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="City or mosque name…"
                    value={searchQuery}
                    onChange={handleSearchInputChange}
                    onKeyDown={handleSearchKeyDown}
                    className="bg-slate-900 border-slate-700 text-slate-100 flex-1"
                  />
                  <Button
                    onClick={() => fetchMosques(searchQuery)}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white flex-shrink-0 touch-manipulation"
                  >
                    <Search className="w-4 h-4" />
                  </Button>
                </div>
                <p className="text-xs text-slate-500">Searching near: {onboardingCityLabel}</p>

                <div className="flex flex-wrap gap-2">
                  {([ { value: "AUTO", label: `Auto (${settings.sect})` }, { value: "ALL", label: "All" }, { value: "SUNNI", label: "Sunni" }, { value: "SHIA", label: "Shia" } ] as Array<{ value: SectFilter; label: string }>).map((item) => {
                    const active = sectFilter === item.value;
                    return (
                      <button
                        key={item.value}
                        type="button"
                        onClick={() => setSectFilter(item.value)}
                        className={`rounded-full border px-3 py-1.5 text-sm transition-colors touch-manipulation ${
                          active
                            ? "border-emerald-500 bg-emerald-500/10 text-emerald-200"
                            : "border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-500"
                        }`}
                      >
                        {item.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Results — fixed height with internal scroll, screen never expands */}
              <div
                className="rounded-xl border border-slate-800 bg-slate-950/40 overflow-y-auto"
                style={{ maxHeight: "min(420px, 50vh)" }}
              >
                <div className="px-3 py-3 space-y-2">
                  {mosquesLoading && (
                    <p className="text-slate-400 text-sm px-1 py-2">Loading mosques…</p>
                  )}
                  {!mosquesLoading && mosquesError && (
                    <p className="text-red-400 text-sm px-1 py-2">{mosquesError}</p>
                  )}
                  {!mosquesLoading && !mosquesError && mosques.length === 0 && (
                    <p className="text-slate-400 text-sm px-1 py-2">
                      Search for a city or mosque name to see results.
                    </p>
                  )}

                  {mosques.map((mosque) => {
                    const isSelected = mosque.placeId === selectedMosqueId;
                    return (
                      <div
                        key={mosque.placeId}
                        className={`w-full p-4 rounded-xl border transition-colors flex items-start justify-between gap-3 ${
                          isSelected
                            ? "border-emerald-500 bg-emerald-500/10"
                            : "border-slate-700 bg-slate-800/60 hover:border-slate-500"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => setSelectedMosqueId(mosque.placeId)}
                          className="flex-1 text-left touch-manipulation"
                        >
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <h3 className="text-white text-sm font-medium">{mosque.name}</h3>
                            {isSelected && (
                              <Badge className="bg-emerald-600/20 text-emerald-300 border border-emerald-600/30 text-xs">
                                Selected
                              </Badge>
                            )}
                            <Badge className={`${getSectBadgeClass(mosque.sect)} text-xs`}>
                              {mosque.sect || "UNKNOWN"}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-1.5 text-slate-400 text-xs">
                            <MapPin className="w-3 h-3 flex-shrink-0" />
                            <span>{mosque.address || "Address unavailable"}</span>
                          </div>
                          {mosque.sectConfidence && (
                            <div className="text-[11px] text-slate-500 mt-1">
                              Sect match: {mosque.sectConfidence}
                            </div>
                          )}
                        </button>

                        <div className="flex items-center gap-2 flex-shrink-0">
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); openDirections(mosque); }}
                            title="Directions"
                            className="p-2 rounded-lg border border-slate-700 hover:border-slate-500 bg-slate-900 text-slate-200 hover:text-white touch-manipulation"
                          >
                            <Navigation2 className="w-4 h-4" />
                          </button>
                          {isSelected && (
                            <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Save button — always visible outside the scroll area */}
              <div className="flex justify-end pt-1">
                <Button
                  onClick={handleSave}
                  disabled={saving || !selectedMosqueId}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white min-h-[44px] touch-manipulation"
                >
                  {saving ? "Saving…" : "Save mosque"}
                </Button>
              </div>

              {/* Community Prayer Times — iqamah times from selected mosque */}
              {settings.mosqueName && (
                <div className="mt-6 rounded-xl border border-slate-700/50 bg-slate-800/30 p-5">
                  <h3 className="text-white font-semibold text-sm mb-1">
                    Community prayer times
                  </h3>
                  <p className="text-slate-400 text-xs mb-4 leading-relaxed">
                    Enter your mosque's official iqamah (congregation) times. These will override calculated times when mosque timing is enabled.
                  </p>
                  <IqamahTimesEditor mosqueName={settings.mosqueName} mosqueId={settings.mosqueId ?? null} />
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
