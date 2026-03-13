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
import { ScrollArea } from "../ui/scroll-area";
import { Label } from "../ui/label";
import { apiFetch, getStoredAmazonToken } from "../../lib/api";
import { MapPin, Search, CheckCircle2, Navigation2 } from "lucide-react";

type QuietHours = {
  enabled: boolean;
  from: string;
  to: string;
  muteFajr: boolean;
};

type UserSettings = {
  userId?: string;
  language: string;
  madhhab: string;
  shia: boolean;
  calculationMethod: string;
  highLatitudeMethod: string;
  country: string;
  city: string;
  timezone: string;
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
  location?: {
    lat?: number;
    lng?: number;
  };
};

type MosqueSelectorProps = {
  onboardingData: Record<string, unknown>;
  setOnboardingData: (data: Record<string, unknown>) => void;
};

type SettingsResponse =
  | UserSettings
  | {
      settings?: Partial<UserSettings>;
      userKey?: string;
    };

function isRecord(value: unknown): value is Record<string, unknown> {
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
      ? ((root as { settings?: Record<string, unknown> }).settings as Record<
          string,
          unknown
        >)
      : (root as Record<string, unknown>);

  const quietSource = isRecord(src.quietHours) ? src.quietHours : {};

  return {
    userId:
      asString((root as Record<string, unknown>).userKey) ??
      asString(src.userId) ??
      undefined,
    language: asString(src.language) ?? "en",
    madhhab: asString(src.madhhab) ?? "hanafi",
    shia: asBoolean(src.shia) ?? src.sect === "SHIA",
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
    timezone: normalizeTimezone(src.timezone),
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
    .filter((item): item is Record<string, unknown> => isRecord(item))
    .map((item) => ({
      placeId: asString(item.placeId) ?? "",
      name: asString(item.name) ?? "",
      address: asString(item.address) ?? undefined,
      location: isRecord(item.location)
        ? {
            lat: asNumber(item.location.lat) ?? undefined,
            lng: asNumber(item.location.lng) ?? undefined,
          }
        : undefined,
    }))
    .filter((m) => m.placeId && m.name);
}

function norm(s?: string) {
  return (s ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/,+/g, ",")
    .replace(/,\s+/g, ", ");
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
    typeof settings?.latitude === "number" &&
    typeof settings?.longitude === "number"
      ? `${settings.latitude},${settings.longitude}`
      : "";

  const destinationCoords =
    typeof mosque.location?.lat === "number" &&
    typeof mosque.location?.lng === "number"
      ? `${mosque.location.lat},${mosque.location.lng}`
      : "";

  const destinationText = mosque.address || mosque.name;

  const params = new URLSearchParams();
  params.set("api", "1");
  params.set("travelmode", "driving");

  if (origin) {
    params.set("origin", origin);
  }

  if (destinationCoords) {
    params.set("destination", destinationCoords);
  } else {
    params.set("destination", destinationText);
  }

  if (mosque.placeId) {
    params.set("destination_place_id", mosque.placeId);
  }

  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

export default function MosqueSelector({
  onboardingData,
  setOnboardingData,
}: MosqueSelectorProps) {
  const [settings, setSettings] = useState<UserSettings | null>(null);

  const [mosques, setMosques] = useState<Mosque[]>([]);
  const [mosquesLoading, setMosquesLoading] = useState(false);
  const [mosquesError, setMosquesError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedMosqueId, setSelectedMosqueId] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onboardingCityLabel = useMemo(() => {
    if (!settings) return "";
    return `${settings.city}, ${settings.country}`;
  }, [settings]);

  const selectedMosque = useMemo(
    () => mosques.find((m) => m.placeId === selectedMosqueId) ?? null,
    [mosques, selectedMosqueId]
  );

  async function refreshSettings() {
    const res = await apiFetch("/api/user/settings");
    if (!res.ok) {
      throw new Error(`Failed to load settings (${res.status})`);
    }

    const json = await res.json();
    const normalized = normalizeSettings(json);

    setSettings(normalized);
    setSelectedMosqueId(normalized.mosqueId ?? null);

    if (!searchQuery.trim()) {
      setSearchQuery(normalized.city);
    }

    return normalized;
  }

  const handleSearchInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  };

  const openDirections = (mosque: Mosque) => {
    const url = buildDirectionsUrl(mosque, settings);
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const fetchMosques = async (queryOverride?: string) => {
    if (!settings) return;

    const rawQuery =
      queryOverride?.trim() || searchQuery.trim() || settings.city.trim() || "";

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

      const res = await apiFetch(`/api/mosques?${params.toString()}`);
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `Failed to load mosques (${res.status})`);
      }

      const json = await res.json();
      const normalized = normalizeMosques(json);

      setMosques(normalized);

      if (normalized.length === 0) {
        setMosquesError("No mosques found for this search.");
      }
    } catch (err) {
      console.error(err);
      setMosquesError("Unable to load mosques from server.");
      setMosques([]);
    } finally {
      setMosquesLoading(false);
    }
  };

  useEffect(() => {
    const load = async () => {
      try {
        const token = getStoredAmazonToken();
        if (!token) {
          setError(
            "Please connect Amazon in onboarding step 2 before choosing a mosque."
          );
          return;
        }

        setError(null);
        const loadedSettings = await refreshSettings();

        if (loadedSettings.city) {
          setSearchQuery(loadedSettings.city);
        }
      } catch (err) {
        console.error(err);
        setError("Unable to load settings from server.");
      }
    };

    void load();
  }, []);

  const handleSearchClick = async () => {
    await fetchMosques(searchQuery);
  };

  const handleSearchKeyDown = async (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      await handleSearchClick();
    }
  };

  const handleSave = async () => {
    if (!selectedMosqueId) {
      setError("Please select a mosque first.");
      setSaveMessage(null);
      return;
    }

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
              location:
                typeof settings.mosqueLat === "number" &&
                typeof settings.mosqueLng === "number"
                  ? {
                      lat: settings.mosqueLat,
                      lng: settings.mosqueLng,
                    }
                  : undefined,
            }
          : null);

      const payload: Record<string, unknown> = {
        mosqueId: selectedMosqueId,
        mosqueName: mosqueToSave?.name ?? null,
        mosqueAddress: mosqueToSave?.address ?? null,
        mosqueLat: mosqueToSave?.location?.lat ?? null,
        mosqueLng: mosqueToSave?.location?.lng ?? null,
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
          ? {
              id: mosqueToSave.placeId,
              name: mosqueToSave.name,
              address: mosqueToSave.address ?? null,
              location: mosqueToSave.location ?? null,
            }
          : { id: selectedMosqueId },
        location: {
          ...(isRecord(onboardingData.location) ? onboardingData.location : {}),
          city: updatedSettings.city,
          country: updatedSettings.country,
          timezone: updatedSettings.timezone,
        },
      });

      setSaveMessage("Mosque selection saved.");
    } catch (err) {
      console.error(err);
      setError("Could not save mosque. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 py-8 px-4">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
          <Logo />
          <Navigation />
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6">
          <div>
            <h1 className="text-white text-xl mb-1">Choose your mosque</h1>
            <p className="text-slate-400 text-sm">
              We use your mosque location for mosque-based flows when available,
              while keeping your own saved city and timezone intact.
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
            <p className="text-slate-400 text-sm">Loading settings…</p>
          ) : (
            <>
              <div className="space-y-2">
                <Label className="text-slate-200">Search</Label>

                <div className="flex flex-col md:flex-row gap-3">
                  <Input
                    placeholder="Search by city or mosque name…"
                    value={searchQuery}
                    onChange={handleSearchInputChange}
                    onKeyDown={handleSearchKeyDown}
                    className="bg-slate-900 border-slate-700 text-slate-100 md:max-w-md"
                  />

                  <Button
                    onClick={handleSearchClick}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white md:w-auto"
                  >
                    <Search className="w-4 h-4 mr-2" />
                    Search
                  </Button>
                </div>

                <p className="text-xs text-slate-500">
                  Current city: {onboardingCityLabel}
                </p>
              </div>

              <ScrollArea className="h-[480px] mt-4">
                {mosquesLoading && (
                  <p className="text-slate-400 text-sm px-1">Loading mosques…</p>
                )}

                {!mosquesLoading && mosquesError && (
                  <p className="text-red-400 text-sm px-1">{mosquesError}</p>
                )}

                {!mosquesLoading && !mosquesError && mosques.length === 0 && (
                  <p className="text-slate-400 text-sm px-1">
                    Search for a city or mosque name to load results.
                  </p>
                )}

                <div className="space-y-3 mt-2">
                  {mosques.map((mosque) => {
                    const isSelected = mosque.placeId === selectedMosqueId;

                    return (
                      <div
                        key={mosque.placeId}
                        className={`w-full p-4 rounded-xl border transition-colors flex items-start justify-between gap-4 ${
                          isSelected
                            ? "border-emerald-500 bg-emerald-500/10"
                            : "border-slate-700 bg-slate-800/60 hover:border-slate-500"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => setSelectedMosqueId(mosque.placeId)}
                          className="flex-1 text-left"
                        >
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="text-white text-sm md:text-base">
                                {mosque.name}
                              </h3>
                            </div>

                            <div className="flex items-center gap-2 text-slate-400 text-xs md:text-sm">
                              <MapPin className="w-3 h-3" />
                              <span>{mosque.address || "Address unavailable"}</span>
                            </div>
                          </div>
                        </button>

                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              openDirections(mosque);
                            }}
                            title="Directions"
                            className="p-2 rounded-lg border border-slate-700 hover:border-slate-500 bg-slate-900 text-slate-200 hover:text-white"
                          >
                            <Navigation2 className="w-4 h-4" />
                          </button>

                          {isSelected && (
                            <div className="flex items-center gap-1 text-emerald-400 text-xs md:text-sm">
                              <CheckCircle2 className="w-4 h-4" />
                              Selected
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>

              <div className="flex justify-end pt-4">
                <Button
                  onClick={handleSave}
                  disabled={saving || !selectedMosqueId}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  {saving ? "Saving…" : "Save mosque"}
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}