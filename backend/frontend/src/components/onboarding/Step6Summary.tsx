import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Logo } from "../shared/Logo";
import { ProgressIndicator } from "../shared/ProgressIndicator";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Sparkles, CheckCircle2, XCircle } from "lucide-react";
import { apiFetch, getStoredAmazonToken } from "../../lib/api";

type PrayerName = "fajr" | "dhuhr" | "asr" | "maghrib" | "isha";
type AfterType = "none" | "dua" | "surah";

type JsonRecord = Record<string, unknown>;

type QuietHours = {
  enabled: boolean;
  from: string;
  to: string;
  muteFajr?: boolean;
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

type OnboardingLocation = {
  country?: string;
  city?: string;
  timezone?: string;
  latitude?: number | string;
  longitude?: number | string;
  useMosqueLocation?: boolean;
};

type OnboardingPrayerSettings = {
  calculationMethod?: string;
  method?: string;
  madhhab?: string;
  madhab?: string;
  shia?: boolean;
  sect?: string;
  highLatitudeMethod?: string;
  highLatitudeMode?: string;
};

type OnboardingDevices = {
  quietHours?: QuietHours;
  adhanPreferences?: {
    quietHoursEnabled?: boolean;
    quietHours?: {
      from?: string;
      to?: string;
    };
  };
};

type OnboardingData = {
  connectedPlatforms?: string[];
  selectedPlatforms?: string[];
  location?: OnboardingLocation;
  prayerSettings?: OnboardingPrayerSettings;
  devices?: string[] | OnboardingDevices;
  accountEnabled?: boolean;
  prayerConfigs?: PrayerConfig[];
  mosque?: JsonRecord | null;
};

type Props = {
  onboardingData: OnboardingData;
  setOnboardingData: (data: OnboardingData) => void;
};

type SummaryData = {
  platformsConnected: string[];
  location: {
    country: string;
    city: string;
    timezone: string;
    latitude: number | null;
    longitude: number | null;
    useMosqueLocation: boolean;
    mosqueName?: string | null;
    mosqueAddress?: string | null;
  };
  prayer: {
    sect: string;
    calculationMethod: string;
    madhhab: string;
    madhab: string;
    highLatitudeMethod: string;
  };
  quiet: QuietHours;
  accountEnabled: boolean;
  prayerConfigs: PrayerConfig[];
  linkedDeviceCount: number;
  selectedDeviceIds: string[];
};

const METHOD_LABEL: Record<string, string> = {
  isna: "ISNA (North America)",
  mwl: "Muslim World League",
  karachi: "Karachi",
  makkah: "Makkah",
  egypt: "Egyptian",
  tehran: "Tehran",
  jafari: "Jafari (Shia)",
  ummAlQura: "Umm Al-Qura",
};

const HIGHLAT_LABEL: Record<string, string> = {
  automatic: "Automatic",
  middle_of_the_night: "Middle of the Night",
  one_seventh: "One Seventh",
  angle_based: "Angle Based",
};

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function toNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) {
    return Number(v);
  }
  return null;
}

function normalizeCountry(value: unknown): string {
  const raw = String(value ?? "").trim().replace(/\s+/g, " ");
  if (!raw) return "US";
  if (/^[A-Za-z]{2}$/.test(raw)) return raw.toUpperCase();
  return raw;
}

function normalizeTimezone(value: unknown): string {
  const timezone = asString(value);
  return timezone || "Etc/UTC";
}

function readConnectedPlatforms(onboardingData: OnboardingData): string[] {
  const fromConnected = Array.isArray(onboardingData?.connectedPlatforms)
    ? onboardingData.connectedPlatforms.filter(
        (x): x is string => typeof x === "string"
      )
    : [];

  const fromSelected = Array.isArray(onboardingData?.selectedPlatforms)
    ? onboardingData.selectedPlatforms.filter(
        (x): x is string => typeof x === "string"
      )
    : [];

  const fromLocal = (() => {
    try {
      const raw = localStorage.getItem("adhan_connected_platforms");
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed)
        ? parsed.filter((x): x is string => typeof x === "string")
        : [];
    } catch {
      return [];
    }
  })();

  const merged = new Set<string>([
    ...fromConnected,
    ...fromSelected,
    ...fromLocal,
  ]);

  if (getStoredAmazonToken()) {
    merged.add("alexa");
  }

  return Array.from(merged);
}

function normalizePrayerConfigs(value: unknown): PrayerConfig[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter((item): item is JsonRecord => isRecord(item))
    .map((item) => {
      const prayerNameRaw =
        asString(item.prayerName)?.toLowerCase() ??
        asString(item.prayer_name)?.toLowerCase() ??
        "";

      const prayerName = (
        ["fajr", "dhuhr", "asr", "maghrib", "isha"].includes(prayerNameRaw)
          ? prayerNameRaw
          : "fajr"
      ) as PrayerName;

      const afterAdhanSource = isRecord(item.afterAdhan)
        ? item.afterAdhan
        : null;

      const afterType =
        afterAdhanSource?.type === "dua" || afterAdhanSource?.type === "surah"
          ? afterAdhanSource.type
          : "none";

      return {
        prayerName,
        adhanReciterId: asString(item.adhanReciterId),
        afterAdhan: {
          type: afterType,
          payload: isRecord(afterAdhanSource?.payload)
            ? afterAdhanSource.payload
            : null,
        },
      };
    });
}

async function saveSettings(payload: Record<string, unknown>) {
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
    country,
  });

  const res = await apiFetch(`/api/geocode?${params.toString()}`);
  const data = await res.json().catch(() => null);

  if (!res.ok) {
    const message =
      isRecord(data) && typeof data.error === "string"
        ? data.error
        : "Could not geocode your city.";
    throw new Error(message);
  }

  if (!isRecord(data)) {
    throw new Error("Invalid geocoding response.");
  }

  const lat = toNumber(data.lat);
  const lng = toNumber(data.lng);
  const timezone = normalizeTimezone(data.timezone);

  if (lat === null || lng === null) {
    throw new Error("Geocoding did not return valid coordinates.");
  }

  return { lat, lng, timezone };
}

export default function Step6Summary({
  onboardingData,
  setOnboardingData,
}: Props) {
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const summary = useMemo<SummaryData>(() => {
    const location = onboardingData?.location || {};
    const prayer = onboardingData?.prayerSettings || {};
    const devicesValue = onboardingData?.devices;
    const platformsConnected = readConnectedPlatforms(onboardingData);

    const country = normalizeCountry(location.country);
    const city = location.city?.trim() || "Chicago";
    const timezone = normalizeTimezone(location.timezone);
    const latitude = toNumber(location.latitude);
    const longitude = toNumber(location.longitude);
    const useMosqueLocation = location.useMosqueLocation === true;

    const calculationMethod = prayer.calculationMethod || prayer.method || "isna";
    const madhhab = prayer.madhhab || "hanafi";
    const sect = prayer.sect || (prayer.shia ? "SHIA" : "SUNNI");
    const madhab = prayer.madhab || (prayer.shia ? "shia" : "sunni");
    const highLatitudeMethod =
      prayer.highLatitudeMethod || prayer.highLatitudeMode || "automatic";

    const quietHoursEnabled =
      !Array.isArray(devicesValue) &&
      (devicesValue?.adhanPreferences?.quietHoursEnabled === true ||
        devicesValue?.quietHours?.enabled === true);

    const quietFrom =
      !Array.isArray(devicesValue)
        ? devicesValue?.adhanPreferences?.quietHours?.from ||
          devicesValue?.quietHours?.from ||
          "22:00"
        : "22:00";

    const quietTo =
      !Array.isArray(devicesValue)
        ? devicesValue?.adhanPreferences?.quietHours?.to ||
          devicesValue?.quietHours?.to ||
          "07:00"
        : "07:00";

    const selectedDeviceIds = Array.isArray(devicesValue)
      ? devicesValue.filter(
          (id): id is string => typeof id === "string" && id.trim().length > 0
        )
      : [];

    return {
      platformsConnected,
      location: {
        country,
        city,
        timezone,
        latitude,
        longitude,
        useMosqueLocation,
      },
      prayer: {
        sect,
        calculationMethod,
        madhhab,
        madhab,
        highLatitudeMethod,
      },
      quiet: {
        enabled: quietHoursEnabled,
        from: quietFrom,
        to: quietTo,
        muteFajr: true,
      },
      accountEnabled: onboardingData?.accountEnabled !== false,
      prayerConfigs: normalizePrayerConfigs(onboardingData?.prayerConfigs),
      linkedDeviceCount: selectedDeviceIds.length,
      selectedDeviceIds,
    };
  }, [onboardingData]);

  function isConnected(platform: string) {
    return summary.platformsConnected.includes(platform);
  }

  const hasReciterConfigured = useMemo(() => {
    return summary.prayerConfigs.some((config) => !!config.adhanReciterId);
  }, [summary.prayerConfigs]);

  const isComplete = useMemo(() => {
    return isConnected("alexa") && summary.accountEnabled && hasReciterConfigured;
  }, [summary.accountEnabled, hasReciterConfigured, summary.platformsConnected]);

  async function finish() {
    setSaving(true);
    setError(null);

    try {
      const amazonToken = getStoredAmazonToken();
      if (!amazonToken) {
        throw new Error("Please connect Amazon in Step 2 before finishing setup.");
      }

      if (!summary.location.city.trim()) {
        throw new Error("City is required before finishing setup.");
      }

      if (!hasReciterConfigured) {
        throw new Error("Please choose at least one Adhan reciter before finishing setup.");
      }

      const loginResp = await apiFetch("/api/integrations/alexa/login", {
        method: "POST",
        body: JSON.stringify({ accessToken: amazonToken }),
      });

      if (!loginResp.ok) {
        const loginText = await loginResp.text().catch(() => "");
        throw new Error(
          loginText || "Amazon Alexa account sync failed. Please reconnect Amazon."
        );
      }

      let syncedLatitude = summary.location.latitude;
      let syncedLongitude = summary.location.longitude;
      let syncedTimezone = summary.location.timezone;

      if (syncedLatitude === null || syncedLongitude === null) {
        const geo = await geocodeLocation(
          summary.location.city,
          summary.location.country
        );
        syncedLatitude = geo.lat;
        syncedLongitude = geo.lng;

        if (!summary.location.timezone || summary.location.timezone === "Etc/UTC") {
          syncedTimezone = geo.timezone;
        }
      }

      const payload: Record<string, unknown> = {
        country: summary.location.country,
        city: summary.location.city,
        timezone: syncedTimezone,
        useMosqueLocation: summary.location.useMosqueLocation,
        calculationMethod: summary.prayer.calculationMethod,
        madhhab: summary.prayer.madhhab,
        shia: summary.prayer.madhab === "shia",
        sect: summary.prayer.sect,
        highLatitudeMethod: summary.prayer.highLatitudeMethod,
        accountEnabled: summary.accountEnabled,
        account_enabled: summary.accountEnabled,
        selectedAlexaDeviceIds: summary.selectedDeviceIds,
        selectedDeviceIds: summary.selectedDeviceIds,
        quietHours: {
          enabled: summary.quiet.enabled,
          from: summary.quiet.from,
          to: summary.quiet.to,
          muteFajr: true,
        },
        prayerConfigs: summary.prayerConfigs,
      };

      if (syncedLatitude !== null) {
        payload.latitude = syncedLatitude;
      }

      if (syncedLongitude !== null) {
        payload.longitude = syncedLongitude;
      }

      const resp = await saveSettings(payload);

      if (!resp.ok) {
        const text = await resp.text().catch(() => "");
        throw new Error(text || "Failed to save settings.");
      }

      setOnboardingData({
        ...onboardingData,
        connectedPlatforms: summary.platformsConnected,
        location: {
          ...(isRecord(onboardingData.location) ? onboardingData.location : {}),
          country: summary.location.country,
          city: summary.location.city,
          timezone: syncedTimezone,
          latitude: syncedLatitude,
          longitude: syncedLongitude,
          useMosqueLocation: summary.location.useMosqueLocation,
        },
        devices: summary.selectedDeviceIds,
        accountEnabled: summary.accountEnabled,
        prayerConfigs: summary.prayerConfigs,
      });

      navigate("/dashboard");
    } catch (e: unknown) {
      if (e instanceof Error) {
        setError(e.message);
      } else {
        setError("Failed to finish onboarding.");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950">
      <div className="sticky top-0 z-20 bg-slate-950/95 backdrop-blur-sm border-b border-slate-800/50">
        <div className="max-w-7xl mx-auto px-4 py-4 md:px-6">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <Logo />
            <ProgressIndicator currentStep={6} totalSteps={6} />
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8 md:py-12">
        <div className="mb-8 md:mb-10 text-center">
          <div className="inline-flex items-center justify-center gap-3 mb-4">
            <div className="rounded-full bg-gradient-to-br from-emerald-500/20 to-teal-500/20 p-3">
              <Sparkles className="w-8 h-8 text-emerald-400" />
            </div>
          </div>
          <h1 className="text-3xl md:text-4xl font-semibold text-white mb-3">
            You&apos;re all set!
          </h1>
          <p className="text-base md:text-lg text-slate-400 leading-relaxed max-w-2xl mx-auto">
            Review your settings below. When everything looks good, click{" "}
            <strong className="text-white">Complete Setup</strong> to start receiving prayer time notifications.
          </p>
        </div>

        {error && (
          <div className="mb-6 rounded-xl border border-red-500/50 bg-red-500/10 px-5 py-4">
            <p className="text-red-300 text-sm leading-relaxed">{error}</p>
          </div>
        )}

        <div className="rounded-3xl border border-slate-800/60 bg-slate-900/40 backdrop-blur-sm p-6 md:p-10 space-y-8">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <div className="h-1 w-1 rounded-full bg-emerald-400" />
              <h2 className="text-white text-lg font-semibold">Connection status</h2>
            </div>

            <div className="rounded-xl border border-slate-700/60 bg-slate-800/30 p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`rounded-lg p-2 ${isConnected("alexa") ? "bg-emerald-500/10" : "bg-slate-700/30"}`}>
                    <svg className={`w-5 h-5 ${isConnected("alexa") ? "text-emerald-400" : "text-slate-500"}`} fill="currentColor" viewBox="0 0 20 20">
                      <path d="M10 2a8 8 0 100 16 8 8 0 000-16zm1 11H9v-2h2v2zm0-4H9V5h2v4z" />
                    </svg>
                  </div>
                  <div>
                    <div className="text-white font-medium">Amazon Alexa</div>
                    <div className="text-slate-400 text-sm">Voice assistant integration</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {isConnected("alexa") ? (
                    <>
                      <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                      <span className="text-sm text-emerald-400 font-medium">Connected</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="w-5 h-5 text-slate-500" />
                      <span className="text-sm text-slate-500">Not connected</span>
                    </>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`rounded-lg p-2 ${summary.accountEnabled ? "bg-emerald-500/10" : "bg-slate-700/30"}`}>
                    <svg className={`w-5 h-5 ${summary.accountEnabled ? "text-emerald-400" : "text-slate-500"}`} fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div>
                    <div className="text-white font-medium">Adhan playback</div>
                    <div className="text-slate-400 text-sm">Automatic prayer time announcements</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {summary.accountEnabled ? (
                    <>
                      <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                      <span className="text-sm text-emerald-400 font-medium">Enabled</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="w-5 h-5 text-slate-500" />
                      <span className="text-sm text-slate-500">Disabled</span>
                    </>
                  )}
                </div>
              </div>

              {!isComplete && (
                <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 px-4 py-3">
                  <p className="text-amber-200 text-sm leading-relaxed">
                    Please ensure Amazon Alexa is connected, Adhan playback is enabled, and at least one reciter is selected before completing setup.
                  </p>
                </div>
              )}
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2 mb-4">
              <div className="h-1 w-1 rounded-full bg-emerald-400" />
              <h2 className="text-white text-lg font-semibold">Location & prayer times</h2>
            </div>

            <div className="rounded-xl border border-slate-700/60 bg-slate-800/30 p-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                <div>
                  <div className="text-slate-400 text-sm mb-1">Location</div>
                  <div className="text-white font-medium">
                    {summary.location.city}, {summary.location.country}
                  </div>
                  <div className="text-slate-500 text-xs mt-0.5">
                    {summary.location.timezone}
                  </div>
                </div>

                <div>
                  <div className="text-slate-400 text-sm mb-1">Tradition</div>
                  <div className="text-white font-medium capitalize">
                    {summary.prayer.sect}
                  </div>
                </div>

                <div>
                  <div className="text-slate-400 text-sm mb-1">Calculation method</div>
                  <div className="text-white font-medium">
                    {METHOD_LABEL[summary.prayer.calculationMethod.toLowerCase()] ||
                      summary.prayer.calculationMethod}
                  </div>
                </div>

                <div>
                  <div className="text-slate-400 text-sm mb-1">Asr madhhab</div>
                  <div className="text-white font-medium capitalize">
                    {summary.prayer.madhhab}
                  </div>
                </div>

                <div>
                  <div className="text-slate-400 text-sm mb-1">High latitude rule</div>
                  <div className="text-white font-medium">
                    {HIGHLAT_LABEL[summary.prayer.highLatitudeMethod] ||
                      summary.prayer.highLatitudeMethod}
                  </div>
                </div>

                <div>
                  <div className="text-slate-400 text-sm mb-1">Linked devices</div>
                  <div className="text-white font-medium">
                    {summary.linkedDeviceCount} {summary.linkedDeviceCount === 1 ? "device" : "devices"}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {summary.prayerConfigs.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="h-1 w-1 rounded-full bg-emerald-400" />
                <h2 className="text-white text-lg font-semibold">Adhan preferences</h2>
              </div>

              <div className="rounded-xl border border-slate-700/60 bg-slate-800/30 p-5">
                <div className="space-y-3">
                  {summary.prayerConfigs.map((config) => (
                    <div
                      key={config.prayerName}
                      className="flex items-center justify-between py-2"
                    >
                      <div className="text-white font-medium capitalize">
                        {config.prayerName}
                      </div>
                      <div className="text-right">
                        <div className="text-slate-300 text-sm">
                          {config.adhanReciterId || "No reciter"}
                        </div>
                        {config.afterAdhan.type !== "none" && (
                          <div className="text-slate-500 text-xs capitalize">
                            After: {config.afterAdhan.type}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-5">
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-emerald-500/10 p-2 mt-0.5">
                <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="flex-1">
                <div className="text-white font-medium mb-2">Your settings are secure</div>
                <p className="text-slate-400 text-sm leading-relaxed">
                  All your preferences will be saved to your account and synced with your Alexa devices. You can change any of these settings later from your dashboard.
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 pt-4">
            <Button
              variant="outline"
              onClick={() => navigate("/onboarding/step5")}
              disabled={saving}
              className="flex-1 border-slate-700 text-slate-300 hover:bg-slate-800 h-11"
            >
              Back to review
            </Button>
            <Button
              onClick={finish}
              disabled={saving || !isComplete}
              className="flex-1 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white h-11 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? (
                <span className="flex items-center gap-2">
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Completing setup...
                </span>
              ) : (
                "Complete setup"
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}