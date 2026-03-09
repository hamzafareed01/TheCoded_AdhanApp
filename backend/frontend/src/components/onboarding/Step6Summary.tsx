import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Logo } from "../shared/Logo";
import { ProgressIndicator } from "../shared/ProgressIndicator";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Alert, AlertDescription } from "../ui/alert";
import { CheckCircle, PartyPopper, XCircle } from "lucide-react";
import { apiFetch, getStoredAmazonToken } from "../../lib/api";

type Props = {
  onboardingData: any;
  setOnboardingData: (data: any) => void;
};

const METHOD_LABEL: Record<string, string> = {
  isna: "ISNA (North America)",
  mwl: "Muslim World League",
  karachi: "Karachi (Pakistan)",
  makkah: "Makkah",
  egypt: "Egyptian",
  tehran: "Tehran",
  jafari: "Jafari (Shia)",
};

const HIGHLAT_LABEL: Record<string, string> = {
  automatic: "Automatic",
  middle_of_the_night: "Middle of the Night",
  one_seventh: "One Seventh",
  angle_based: "Angle Based",
};

function toNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return null;
}

function readConnectedPlatforms(onboardingData: any): string[] {
  if (Array.isArray(onboardingData?.connectedPlatforms)) return onboardingData.connectedPlatforms;
  try {
    const raw = localStorage.getItem("adhan_connected_platforms");
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export default function Step6Summary({ onboardingData }: Props) {
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const summary = useMemo(() => {
    const location = onboardingData?.location || {};
    const prayer = onboardingData?.prayerSettings || {};
    const devices = onboardingData?.devices || {};
    const platformsSelected: string[] = onboardingData?.selectedPlatforms || [];
    const platformsConnected: string[] = readConnectedPlatforms(onboardingData);

    const country = location?.country || "US";
    const city = location?.city || "Chicago";
    const timezone = location?.timezone || "America/Chicago";
    const latitude = toNumber(location?.latitude);
    const longitude = toNumber(location?.longitude);

    const calculationMethod: string = prayer?.calculationMethod || prayer?.method || "isna";
    const madhhab: string = prayer?.madhhab || "hanafi";
    const madhab: string = prayer?.madhab || (prayer?.shia ? "shia" : "sunni");
    const highLatitudeMethod: string = prayer?.highLatitudeMethod || prayer?.highLatitudeMode || "automatic";

    const quietHoursEnabled =
      devices?.adhanPreferences?.quietHoursEnabled === true ||
      devices?.quietHours?.enabled === true;

    const quietFrom =
      devices?.adhanPreferences?.quietHours?.from ||
      devices?.quietHours?.from ||
      "22:00";

    const quietTo =
      devices?.adhanPreferences?.quietHours?.to ||
      devices?.quietHours?.to ||
      "07:00";

    return {
      platformsSelected,
      platformsConnected,
      location: { country, city, timezone, latitude, longitude },
      prayer: { calculationMethod, madhhab, madhab, highLatitudeMethod },
      quiet: { enabled: quietHoursEnabled, from: quietFrom, to: quietTo },
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

      await apiFetch("/api/integrations/alexa/login", {
        method: "POST",
        body: JSON.stringify({ accessToken: amazonToken }),
      }).catch(() => {
        // safe no-op
      });

      const payload = {
        country: summary.location.country,
        city: summary.location.city,
        timezone: summary.location.timezone,
        ...(summary.location.latitude !== null ? { latitude: summary.location.latitude } : {}),
        ...(summary.location.longitude !== null ? { longitude: summary.location.longitude } : {}),
        calculationMethod: summary.prayer.calculationMethod,
        madhhab: summary.prayer.madhhab,
        shia: summary.prayer.madhab === "shia",
        highLatitudeMethod: summary.prayer.highLatitudeMethod,
        quietHours: {
          enabled: summary.quiet.enabled,
          from: summary.quiet.from,
          to: summary.quiet.to,
          muteFajr: true,
        },
      };

      const resp = await apiFetch("/api/user/settings", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      if (!resp.ok) {
        const text = await resp.text().catch(() => "");
        throw new Error(text || "Failed to save settings.");
      }

      navigate("/dashboard");
    } catch (e: any) {
      setError(e?.message || "Failed to finish onboarding.");
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
            Review everything below. When you click <b>Finish</b>, we’ll save your preferences to your account.
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
                    <span className="text-sm text-muted-foreground">Not connected</span>
                  </>
                )}
              </div>
            </div>

            <div className="text-xs text-muted-foreground">
              Amazon should show connected before you finish, otherwise the dashboard will not be able to load your protected settings.
            </div>
          </div>
        </div>

        <div className="rounded-xl border bg-card p-5 space-y-4">
          <h2 className="text-lg font-semibold">Your Settings</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-muted-foreground">Location</div>
              <div className="font-medium">{summary.location.city}, {summary.location.country}</div>
              <div className="text-xs text-muted-foreground">{summary.location.timezone}</div>
            </div>

            <div>
              <div className="text-muted-foreground">Calculation Method</div>
              <div className="font-medium">{METHOD_LABEL[summary.prayer.calculationMethod] || summary.prayer.calculationMethod}</div>
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
              <div className="font-medium">{HIGHLAT_LABEL[summary.prayer.highLatitudeMethod] || summary.prayer.highLatitudeMethod}</div>
            </div>

            <div>
              <div className="text-muted-foreground">Quiet Hours</div>
              <div className="font-medium">{summary.quiet.enabled ? `${summary.quiet.from} → ${summary.quiet.to}` : "Off"}</div>
            </div>
          </div>
        </div>

        <div className="flex justify-between">
          <Button variant="outline" onClick={() => navigate("/onboarding/step5")} disabled={saving}>Back</Button>
          <Button onClick={finish} disabled={saving}>{saving ? "Saving..." : "Finish"}</Button>
        </div>
      </div>
    </div>
  );
}
