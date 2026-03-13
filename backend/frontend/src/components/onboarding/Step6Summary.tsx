import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Logo } from "../shared/Logo";
import { ProgressIndicator } from "../shared/ProgressIndicator";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Alert, AlertDescription } from "../ui/alert";
import { CheckCircle, PartyPopper, XCircle } from "lucide-react";
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
  };
  prayer: {
    calculationMethod: string;
    madhhab: string;
    madhab: string;
    highLatitudeMethod: string;
  };
  quiet: QuietHours;
  accountEnabled: boolean;
  prayerConfigs: PrayerConfig[];
  selectedDeviceCount: number;
};

const METHOD_LABEL: Record<string, string> = {
  isna: "ISNA (North America)",
  mwl: "Muslim World League",
  karachi: "Karachi",
  makkah: "Makkah",
  egypt: "Egyptian",
  tehran: "Tehran",
  jafari: "Jafari (Shia)",
  ummalqura: "Umm Al-Qura",
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
  const fromData = Array.isArray(onboardingData?.connectedPlatforms)
    ? onboardingData.connectedPlatforms.filter(
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

  const merged = new Set<string>([...fromData, ...fromLocal]);

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

    const selectedDeviceCount = Array.isArray(devicesValue)
      ? devicesValue.length
      : 0;

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
      selectedDeviceCount,
    };
  }, [onboardingData]);

  function isConnected(platform: string) {
    return summary.platformsConnected.includes(platform);
  }

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
        highLatitudeMethod: summary.prayer.highLatitudeMethod,
        accountEnabled: summary.accountEnabled,
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
        location: {
          ...(isRecord(onboardingData.location) ? onboardingData.location : {}),
          country: summary.location.country,
          city: summary.location.city,
          timezone: syncedTimezone,
          latitude: syncedLatitude,
          longitude: syncedLongitude,
          useMosqueLocation: summary.location.useMosqueLocation,
        },
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
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-background via-background to-muted p-6">
      <Logo className="mb-6" />
      <ProgressIndicator currentStep={6} totalSteps={6} />

      <div className="w-full max-w-3xl mt-6 space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2">
            <PartyPopper className="w-6 h-6" />
            <h1 className="text-3xl font-bold">Setup Complete</h1>
            <Badge variant="secondary">Ready</Badge>
          </div>
          <p className="text-muted-foreground">
            Review everything below. When you click <b>Finish</b>, we’ll save
            your real preferences to your account.
          </p>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="rounded-xl border bg-card p-5 space-y-4">
          <h2 className="text-lg font-semibold">Connected Accounts</h2>

          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="font-medium">Amazon (Alexa)</div>
              <div className="flex items-center gap-2">
                {isConnected("alexa") ? (
                  <>
                    <CheckCircle className="w-5 h-5" />
                    <span className="text-sm">Connected</span>
                  </>
                ) : (
                  <>
                    <XCircle className="w-5 h-5" />
                    <span className="text-sm text-muted-foreground">
                      Not connected
                    </span>
                  </>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="font-medium">Account Enabled</div>
              <div className="text-sm">
                {summary.accountEnabled ? "Yes" : "No"}
              </div>
            </div>

            <div className="text-xs text-muted-foreground">
              Amazon must show connected before you finish, otherwise the
              dashboard will not be able to load your protected settings.
            </div>
          </div>
        </div>

        <div className="rounded-xl border bg-card p-5 space-y-4">
          <h2 className="text-lg font-semibold">Your Settings</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-muted-foreground">Location</div>
              <div className="font-medium">
                {summary.location.city}, {summary.location.country}
              </div>
              <div className="text-xs text-muted-foreground">
                {summary.location.timezone}
              </div>
              {summary.location.latitude !== null &&
                summary.location.longitude !== null && (
                  <div className="text-xs text-muted-foreground mt-1">
                    {summary.location.latitude.toFixed(5)},{" "}
                    {summary.location.longitude.toFixed(5)}
                  </div>
                )}
            </div>

            <div>
              <div className="text-muted-foreground">Calculation Method</div>
              <div className="font-medium">
                {METHOD_LABEL[summary.prayer.calculationMethod.toLowerCase()] ||
                  summary.prayer.calculationMethod}
              </div>
            </div>

            <div>
              <div className="text-muted-foreground">Asr (Madhhab)</div>
              <div className="font-medium">{summary.prayer.madhhab}</div>
            </div>

            <div>
              <div className="text-muted-foreground">Preference</div>
              <div className="font-medium">{summary.prayer.madhab}</div>
            </div>

            <div>
              <div className="text-muted-foreground">High Latitude Rule</div>
              <div className="font-medium">
                {HIGHLAT_LABEL[summary.prayer.highLatitudeMethod] ||
                  summary.prayer.highLatitudeMethod}
              </div>
            </div>

            <div>
              <div className="text-muted-foreground">Quiet Hours</div>
              <div className="font-medium">
                {summary.quiet.enabled
                  ? `${summary.quiet.from} → ${summary.quiet.to}`
                  : "Off"}
              </div>
            </div>

            <div>
              <div className="text-muted-foreground">Use Mosque Location</div>
              <div className="font-medium">
                {summary.location.useMosqueLocation ? "Yes" : "No"}
              </div>
            </div>

            <div>
              <div className="text-muted-foreground">Selected Devices</div>
              <div className="font-medium">{summary.selectedDeviceCount}</div>
            </div>
          </div>
        </div>

        <div className="rounded-xl border bg-card p-5 space-y-4">
          <h2 className="text-lg font-semibold">Per-Prayer Adhan</h2>

          {summary.prayerConfigs.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              No per-prayer Adhan preferences were found yet.
            </div>
          ) : (
            <div className="space-y-2">
              {summary.prayerConfigs.map((config) => (
                <div
                  key={config.prayerName}
                  className="flex items-center justify-between text-sm"
                >
                  <div className="capitalize font-medium">
                    {config.prayerName}
                  </div>
                  <div className="text-muted-foreground text-right">
                    <div>
                      Reciter: {config.adhanReciterId || "Not selected"}
                    </div>
                    <div>After Adhan: {config.afterAdhan.type}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-between">
          <Button
            variant="outline"
            onClick={() => navigate("/onboarding/step5")}
            disabled={saving}
          >
            Back
          </Button>
          <Button onClick={finish} disabled={saving}>
            {saving ? "Saving..." : "Finish"}
          </Button>
        </div>
      </div>
    </div>
  );
}