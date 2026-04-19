import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Logo } from "../shared/Logo";
import { ProgressIndicator } from "../shared/ProgressIndicator";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Input } from "../ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { RadioGroup, RadioGroupItem } from "../ui/radio-group";
import { Label } from "../ui/label";
import { Settings2 } from "lucide-react";
import { apiFetch, getStoredAmazonToken } from "../../lib/api";

type Sect = "SUNNI" | "SHIA";
type PrayerName = "fajr" | "dhuhr" | "asr" | "maghrib" | "isha";

export type PrayerMethod =
  | "isna"
  | "karachi"
  | "mwl"
  | "makkah"
  | "egypt"
  | "ummAlQura"
  | "tehran"
  | "jafari";

export type HighLatitudeMode =
  | "automatic"
  | "middle_of_the_night"
  | "one_seventh"
  | "angle_based";

type Offsets = Record<PrayerName, number>;

type PrayerSettingsData = {
  sect?: Sect;
  shia?: boolean;
  calculationMethod?: PrayerMethod;
  madhhab?: "hanafi" | "shafi";
  highLatitudeMode?: HighLatitudeMode;
  highLatitudeMethod?: HighLatitudeMode;
  offsets?: Partial<Offsets>;
};

type OnboardingData = {
  location?: {
    country?: string;
    city?: string;
    timezone?: string;
  };
  prayerSettings?: PrayerSettingsData;
  [key: string]: unknown;
};

type Step4PrayerSettingsProps = {
  onboardingData: OnboardingData;
  setOnboardingData: (data: OnboardingData) => void;
};

const PRAYERS: PrayerName[] = ["fajr", "dhuhr", "asr", "maghrib", "isha"];

function defaultOffsets(): Offsets {
  return { fajr: 0, dhuhr: 0, asr: 0, maghrib: 0, isha: 0 };
}

function sanitizeNonNegativeOffset(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.trunc(n));
}

function normalizeCountry(value: unknown): string {
  const raw = String(value ?? "").trim().toUpperCase();
  return raw || "US";
}


function getDefaultMethodForCountry(country: string, sect: Sect): PrayerMethod {
  if (sect === "SHIA") {
    return country === "IR" ? "tehran" : "jafari";
  }

  if (country === "PK") return "karachi";
  if (country === "SA") return "ummAlQura";
  if (country === "EG") return "egypt";
  if (country === "US" || country === "CA") return "isna";
  return "mwl";
}



function normalizeMethod(
  value: unknown,
  country: string,
  sect: Sect
): PrayerMethod {
  const raw = String(value ?? "").trim();
  const allowed: PrayerMethod[] =
    sect === "SHIA"
      ? ["jafari", "tehran"]
      : ["isna", "karachi", "mwl", "makkah", "egypt", "ummAlQura"];

  if (allowed.includes(raw as PrayerMethod)) {
    return raw as PrayerMethod;
  }

  return getDefaultMethodForCountry(country, sect);
}


function normalizeHighLatitudeMode(value: unknown): HighLatitudeMode {
  const raw = String(value ?? "").trim();

  const allowed: HighLatitudeMode[] = [
    "automatic",
    "middle_of_the_night",
    "one_seventh",
    "angle_based",
  ];

  return allowed.includes(raw as HighLatitudeMode)
    ? (raw as HighLatitudeMode)
    : "automatic";
}

function normalizeMadhhab(value: unknown): "hanafi" | "shafi" {
  return String(value ?? "").trim().toLowerCase() === "shafi"
    ? "shafi"
    : "hanafi";
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

export default function Step4PrayerSettings({
  onboardingData,
  setOnboardingData,
}: Step4PrayerSettingsProps) {
  const navigate = useNavigate();

  const existing = onboardingData?.prayerSettings || {};
  const country = normalizeCountry(onboardingData?.location?.country);

  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initialSect: Sect = existing?.shia === true || existing?.sect === "SHIA"
    ? "SHIA"
    : "SUNNI";

  const [sect, setSect] = useState<Sect>(initialSect);
  const [calculationMethod, setCalculationMethod] = useState<PrayerMethod>(
    normalizeMethod(existing?.calculationMethod, country, initialSect)
  );
  const [madhhab, setMadhhab] = useState<"hanafi" | "shafi">(
    normalizeMadhhab(existing?.madhhab)
  );
  const [highLatitudeMode, setHighLatitudeMode] = useState<HighLatitudeMode>(
    normalizeHighLatitudeMode(
      existing?.highLatitudeMode || existing?.highLatitudeMethod
    )
  );
  const [offsets, setOffsets] = useState<Offsets>({
    ...defaultOffsets(),
    ...(existing?.offsets || {}),
  });

  useEffect(() => {
    async function hydrate() {
      if (existing && Object.keys(existing).length > 0) {
        const nextSect: Sect =
          existing?.shia === true || existing?.sect === "SHIA" ? "SHIA" : "SUNNI";

        setSect(nextSect);
        setCalculationMethod(
          normalizeMethod(existing?.calculationMethod, country, nextSect)
        );
        setMadhhab(normalizeMadhhab(existing?.madhhab));
        setHighLatitudeMode(
          normalizeHighLatitudeMode(
            existing?.highLatitudeMode || existing?.highLatitudeMethod
          )
        );

        if (existing?.offsets && typeof existing.offsets === "object") {
          setOffsets({ ...defaultOffsets(), ...existing.offsets });
        }
        return;
      }

      const token = getStoredAmazonToken();
      if (!token) return;

      try {
        setLoading(true);
        const res = await apiFetch("/api/user/settings");
        if (!res.ok) return;

        const payload = await res.json();
        const s = payload?.settings ?? payload ?? {};

        const nextSect: Sect =
          s?.shia === true || s?.sect === "SHIA" ? "SHIA" : "SUNNI";

        setSect(nextSect);
        setCalculationMethod(
          normalizeMethod(s?.calculationMethod, country, nextSect)
        );
        setMadhhab(normalizeMadhhab(s?.madhhab));
        setHighLatitudeMode(
          normalizeHighLatitudeMode(s?.highLatitudeMethod)
        );

        if (s?.globalOffsets && typeof s.globalOffsets === "object") {
          setOffsets({ ...defaultOffsets(), ...s.globalOffsets });
        }
      } catch {
        // keep local defaults
      } finally {
        setLoading(false);
      }
    }

    void hydrate();
  }, [country]); // eslint-disable-line react-hooks/exhaustive-deps

  
useEffect(() => {
  setCalculationMethod((prev) => normalizeMethod(prev, country, sect));
}, [sect, country]);


  
const calcMethodChoices = useMemo(() => {
  if (sect === "SHIA") {
    return [
      { value: "jafari", label: "Jafari" },
      { value: "tehran", label: "Tehran" },
    ] as const;
  }

  return [
    { value: "isna", label: "ISNA (North America)" },
    { value: "mwl", label: "Muslim World League" },
    { value: "karachi", label: "Karachi" },
    { value: "ummAlQura", label: "Umm Al-Qura" },
    { value: "makkah", label: "Makkah" },
    { value: "egypt", label: "Egyptian Survey" },
  ] as const;
}, [sect]);


  const handleContinue = async () => {
    setError(null);

    const token = getStoredAmazonToken();
    if (!token) {
      setError("Please connect Amazon in Step 2 before saving prayer settings.");
      return;
    }

    const sanitizedOffsets: Offsets = {
      fajr: sanitizeNonNegativeOffset(offsets.fajr),
      dhuhr: sanitizeNonNegativeOffset(offsets.dhuhr),
      asr: sanitizeNonNegativeOffset(offsets.asr),
      maghrib: sanitizeNonNegativeOffset(offsets.maghrib),
      isha: sanitizeNonNegativeOffset(offsets.isha),
    };

    const nextPrayerSettings: PrayerSettingsData = {
      sect,
      shia: sect === "SHIA",
      calculationMethod,
      madhhab,
      highLatitudeMode,
      highLatitudeMethod: highLatitudeMode,
      offsets: sanitizedOffsets,
    };

    setOnboardingData({
      ...onboardingData,
      prayerSettings: nextPrayerSettings,
    });

    setSaving(true);
    try {
      const resp = await saveSettings({
        sect,
        shia: sect === "SHIA",
        calculationMethod,
        madhhab,
        highLatitudeMethod: highLatitudeMode,
        globalOffsets: sanitizedOffsets,
      });

      if (!resp.ok) {
        const msg = await resp.text().catch(() => "");
        throw new Error(
          `Could not save prayer settings (${resp.status}). ${msg}`.trim()
        );
      }

      navigate("/onboarding/step5");
    } catch (e: any) {
      setError(e?.message || "Could not save prayer settings.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 py-8 px-4">
      <div className="max-w-5xl mx-auto">
        <Logo className="mb-8" />
        <ProgressIndicator currentStep={4} totalSteps={6} />

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 md:p-12">
          <div className="flex items-center justify-between mb-8">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <Settings2 className="h-7 w-7 text-emerald-400" />
                <h1 className="text-white">Prayer Settings</h1>
              </div>
              <p className="text-slate-300">
                Choose sect, calculation method, and offsets for accurate prayer times.
              </p>
            </div>
            <Badge
              variant="outline"
              className="border-emerald-500/30 text-emerald-400"
            >
              Step 4 of 6
            </Badge>
          </div>

          {(error || loading) && (
            <div className="mb-6 text-sm rounded-md px-3 py-2 border border-slate-700 bg-slate-800/60 text-slate-200">
              {error || "Loading your saved prayer settings..."}
            </div>
          )}

          <div className="space-y-8">
            <div className="space-y-4">
              <Label className="text-white">Sect</Label>
              <RadioGroup
                value={sect}
                onValueChange={(value: string) => setSect(value as Sect)}
                className="flex gap-6"
              >
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="SUNNI" id="sect-sunni" />
                  <Label htmlFor="sect-sunni" className="text-white cursor-pointer">
                    Sunni
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="SHIA" id="sect-shia" />
                  <Label htmlFor="sect-shia" className="text-white cursor-pointer">
                    Shia
                  </Label>
                </div>
              </RadioGroup>
            </div>

            <div className="space-y-3">
              <Label className="text-white">Calculation Method</Label>
              <Select
                value={calculationMethod}
                onValueChange={(value: string) =>
                  setCalculationMethod(value as PrayerMethod)
                }
              >
                <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                  <SelectValue placeholder="Select calculation method" />
                </SelectTrigger>
                <SelectContent>
                  {calcMethodChoices.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3">
              <Label className="text-white">Madhhab (Asr method)</Label>
              {sect === "SHIA" ? (
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-3 text-sm text-slate-300">
                  Shia mode uses Shia timing rules. The Sunni Asr madhhab selector is hidden here so the sect options stay clean.
                </div>
              ) : (
                <Select
                  value={madhhab}
                  onValueChange={(value: string) =>
                    setMadhhab(value as "hanafi" | "shafi")
                  }
                >
                  <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                    <SelectValue placeholder="Select madhhab" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hanafi">Hanafi (later Asr)</SelectItem>
                    <SelectItem value="shafi">Shafi / Standard</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="space-y-3">
              <Label className="text-white">High Latitude Rule</Label>
              <Select
                value={highLatitudeMode}
                onValueChange={(value: string) =>
                  setHighLatitudeMode(value as HighLatitudeMode)
                }
              >
                <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                  <SelectValue placeholder="Select high latitude rule" />
                </SelectTrigger>
                <SelectContent>
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
              <h2 className="text-white text-lg mb-2">Timing offsets (minutes)</h2>
              <p className="text-slate-400 text-sm mb-4">
                These offsets stay attached to your saved sect and calculation setup.
              </p>

              <div className="grid md:grid-cols-2 gap-4">
                {PRAYERS.map((p) => (
                  <div key={p} className="flex items-center justify-between gap-3">
                    <Label className="text-slate-200 capitalize">{p}</Label>
                    <Input
                      type="number"
                      min={0}
                      step={1}
                      className="w-28 bg-slate-800 border-slate-700 text-white"
                      value={offsets[p]}
                      onChange={(e) => {
                        const nextValue = Math.max(0, Number(e.target.value || 0));
                        setOffsets((prev) => ({
                          ...prev,
                          [p]: nextValue,
                        }));
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="flex justify-between mt-12">
            <Button
              variant="outline"
              onClick={() => navigate("/onboarding/step3")}
              className="border-slate-700 text-white hover:bg-slate-800"
              disabled={saving}
            >
              Back
            </Button>
            <Button
              onClick={handleContinue}
              className="bg-emerald-600 hover:bg-emerald-700"
              disabled={saving}
            >
              {saving ? "Saving…" : "Save & Continue"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
