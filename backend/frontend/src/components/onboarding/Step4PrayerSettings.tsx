import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Logo } from "../shared/Logo";
import { ProgressIndicator } from "../shared/ProgressIndicator";
import { Button } from "../ui/button";
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
 
function sanitizeOffsets(
  value: Partial<Offsets> | Record<string, unknown> | undefined | null
): Offsets {
  const base = defaultOffsets();
  return {
    fajr: sanitizeNonNegativeOffset(value?.fajr ?? base.fajr),
    dhuhr: sanitizeNonNegativeOffset(value?.dhuhr ?? base.dhuhr),
    asr: sanitizeNonNegativeOffset(value?.asr ?? base.asr),
    maghrib: sanitizeNonNegativeOffset(value?.maghrib ?? base.maghrib),
    isha: sanitizeNonNegativeOffset(value?.isha ?? base.isha),
  };
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
 
function normalizeMethod(value: unknown, country: string, sect: Sect): PrayerMethod {
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
  return String(value ?? "").trim().toLowerCase() === "shafi" ? "shafi" : "hanafi";
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
 
  const initialSect: Sect =
    existing?.shia === true || existing?.sect === "SHIA" ? "SHIA" : "SUNNI";
 
  const [sect, setSect] = useState<Sect>(initialSect);
  const [calculationMethod, setCalculationMethod] = useState<PrayerMethod>(
    normalizeMethod(existing?.calculationMethod, country, initialSect)
  );
  const [madhhab, setMadhhab] = useState<"hanafi" | "shafi">(
    normalizeMadhhab(existing?.madhhab)
  );
  const [highLatitudeMode, setHighLatitudeMode] = useState<HighLatitudeMode>(
    normalizeHighLatitudeMode(existing?.highLatitudeMode || existing?.highLatitudeMethod)
  );
  const [offsets, setOffsets] = useState<Offsets>(sanitizeOffsets(existing?.offsets));
 
  useEffect(() => {
    async function hydrate() {
      if (existing && Object.keys(existing).length > 0) {
        const nextSect: Sect =
          existing?.shia === true || existing?.sect === "SHIA" ? "SHIA" : "SUNNI";
 
        setSect(nextSect);
        setCalculationMethod(normalizeMethod(existing?.calculationMethod, country, nextSect));
        setMadhhab(normalizeMadhhab(existing?.madhhab));
        setHighLatitudeMode(
          normalizeHighLatitudeMode(existing?.highLatitudeMode || existing?.highLatitudeMethod)
        );
        setOffsets(sanitizeOffsets(existing?.offsets));
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
        setCalculationMethod(normalizeMethod(s?.calculationMethod, country, nextSect));
        setMadhhab(normalizeMadhhab(s?.madhhab));
        setHighLatitudeMode(normalizeHighLatitudeMode(s?.highLatitudeMethod));
        setOffsets(sanitizeOffsets(s?.globalOffsets));
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
 
  const updateOffset = (prayer: PrayerName, rawValue: string) => {
    setOffsets((prev) => ({
      ...prev,
      [prayer]: sanitizeNonNegativeOffset(rawValue),
    }));
  };
 
  const handleContinue = async () => {
    setError(null);
 
    const token = getStoredAmazonToken();
    if (!token) {
      setError("Please connect Amazon in Step 2 before saving prayer settings.");
      return;
    }
 
    const sanitizedOffsets = sanitizeOffsets(offsets);
 
    const nextPrayerSettings: PrayerSettingsData = {
      sect,
      shia: sect === "SHIA",
      calculationMethod,
      madhhab,
      highLatitudeMode,
      highLatitudeMethod: highLatitudeMode,
      offsets: sanitizedOffsets,
    };
 
    setOnboardingData({ ...onboardingData, prayerSettings: nextPrayerSettings });
 
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
        throw new Error(`Could not save prayer settings (${resp.status}). ${msg}`.trim());
      }
 
      navigate("/onboarding/step5");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not save prayer settings.");
    } finally {
      setSaving(false);
    }
  };
 
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
            <ProgressIndicator currentStep={4} totalSteps={6} />
          </div>
        </div>
      </div>
 
      <div
        className="max-w-4xl mx-auto px-4 py-8 md:py-12"
        style={{ paddingBottom: "calc(2rem + env(safe-area-inset-bottom))" }}
      >
        {/* Hero Section */}
        <div className="mb-8 md:mb-10">
          <h1 className="text-3xl md:text-4xl font-semibold text-white mb-3">
            Configure prayer times
          </h1>
          <p className="text-base md:text-lg text-slate-400 leading-relaxed max-w-2xl">
            Choose your calculation method and fine-tune settings to match your local
            mosque or community.
          </p>
        </div>
 
        {/* Main Content Card */}
        <div className="rounded-3xl border border-slate-800/60 bg-slate-900/40 backdrop-blur-sm p-6 md:p-10">
          {/* Alerts */}
          {error && (
            <div className="mb-6 rounded-xl border border-red-500/50 bg-red-500/10 px-5 py-4">
              <p className="text-red-300 text-sm leading-relaxed">{error}</p>
            </div>
          )}
 
          {loading && (
            <div className="mb-6 rounded-xl border border-slate-700/50 bg-slate-800/30 px-5 py-4">
              <div className="flex items-center gap-3">
                <svg
                  className="w-4 h-4 animate-spin text-slate-400"
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
                  Loading your saved prayer settings...
                </p>
              </div>
            </div>
          )}
 
          {/* Basic Settings Section */}
          <div className="mb-8">
            <h2 className="text-white text-base font-semibold mb-4">Basic settings</h2>
 
            {/* Sect Selection */}
            <div className="mb-6">
              <Label className="text-white mb-3 block text-sm font-medium">
                Tradition
              </Label>
              <RadioGroup
                value={sect}
                onValueChange={(value: string) => setSect(value as Sect)}
                className="grid grid-cols-1 sm:grid-cols-2 gap-3"
              >
                <div className="relative">
                  <RadioGroupItem value="SUNNI" id="sect-sunni" className="peer sr-only" />
                  <Label
                    htmlFor="sect-sunni"
                    className={`flex items-center justify-between p-5 rounded-xl border-2 cursor-pointer transition-all touch-manipulation select-none ${
                      sect === "SUNNI"
                        ? "border-emerald-500/50 bg-emerald-500/10"
                        : "border-slate-700/60 bg-slate-800/40 hover:border-slate-600"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`h-5 w-5 rounded-full border-2 flex items-center justify-center ${
                          sect === "SUNNI"
                            ? "border-emerald-500 bg-emerald-500"
                            : "border-slate-600"
                        }`}
                      >
                        {sect === "SUNNI" && (
                          <svg
                            className="w-3 h-3 text-white"
                            fill="currentColor"
                            viewBox="0 0 20 20"
                          >
                            <path
                              fillRule="evenodd"
                              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                              clipRule="evenodd"
                            />
                          </svg>
                        )}
                      </div>
                      <div>
                        <div className="text-white font-medium">Sunni</div>
                        <div className="text-slate-400 text-xs mt-0.5">
                          Standard calculation methods
                        </div>
                      </div>
                    </div>
                  </Label>
                </div>
 
                <div className="relative">
                  <RadioGroupItem value="SHIA" id="sect-shia" className="peer sr-only" />
                  <Label
                    htmlFor="sect-shia"
                    className={`flex items-center justify-between p-5 rounded-xl border-2 cursor-pointer transition-all touch-manipulation select-none ${
                      sect === "SHIA"
                        ? "border-emerald-500/50 bg-emerald-500/10"
                        : "border-slate-700/60 bg-slate-800/40 hover:border-slate-600"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`h-5 w-5 rounded-full border-2 flex items-center justify-center ${
                          sect === "SHIA"
                            ? "border-emerald-500 bg-emerald-500"
                            : "border-slate-600"
                        }`}
                      >
                        {sect === "SHIA" && (
                          <svg
                            className="w-3 h-3 text-white"
                            fill="currentColor"
                            viewBox="0 0 20 20"
                          >
                            <path
                              fillRule="evenodd"
                              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                              clipRule="evenodd"
                            />
                          </svg>
                        )}
                      </div>
                      <div>
                        <div className="text-white font-medium">Shia</div>
                        <div className="text-slate-400 text-xs mt-0.5">
                          Jafari calculation methods
                        </div>
                      </div>
                    </div>
                  </Label>
                </div>
              </RadioGroup>
            </div>
 
            {/* Calculation Method */}
            <div className="mb-6">
              <Label className="text-white mb-2 block text-sm font-medium">
                Calculation method
              </Label>
              <Select
                value={calculationMethod}
                onValueChange={(value: string) =>
                  setCalculationMethod(value as PrayerMethod)
                }
              >
                <SelectTrigger className="bg-slate-800/60 border-slate-700/60 text-white h-11">
                  <SelectValue placeholder="Select calculation method" />
                </SelectTrigger>
                <SelectContent className="bg-slate-900 border-slate-700 text-slate-100">
                  {calcMethodChoices.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-2 text-xs text-slate-500">
                {sect === "SUNNI"
                  ? "Different regions use different angle calculations for Fajr and Isha."
                  : "Choose between Jafari or Tehran calculation methods."}
              </p>
            </div>
 
            {/* Madhhab — Sunni only */}
            {sect === "SUNNI" && (
              <div>
                <Label className="text-white mb-2 block text-sm font-medium">
                  Madhhab (Asr calculation)
                </Label>
                <Select
                  value={madhhab}
                  onValueChange={(value: string) =>
                    setMadhhab(value as "hanafi" | "shafi")
                  }
                >
                  <SelectTrigger className="bg-slate-800/60 border-slate-700/60 text-white h-11">
                    <SelectValue placeholder="Select madhhab" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-900 border-slate-700 text-slate-100">
                    <SelectItem value="hanafi">Hanafi (later Asr)</SelectItem>
                    <SelectItem value="shafi">Shafi / Standard</SelectItem>
                  </SelectContent>
                </Select>
                <p className="mt-2 text-xs text-slate-500">
                  Hanafi calculates Asr when shadow length equals object height + noon
                  shadow.
                </p>
              </div>
            )}
 
            {/* Shia Info Box */}
            {sect === "SHIA" && (
              <div className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-4">
                <p className="text-sm text-slate-300 leading-relaxed">
                  Shia prayer times use Jafari jurisprudence. The Asr madhhab option only
                  applies to Sunni calculations.
                </p>
              </div>
            )}
          </div>
 
          {/* Advanced Settings — Collapsible */}
          <details className="group mb-8">
            <summary className="flex items-center justify-between cursor-pointer p-4 rounded-xl border border-slate-700/60 bg-slate-800/30 hover:bg-slate-800/50 transition-colors touch-manipulation select-none">
              <div className="flex items-center gap-3">
                <Settings2 className="w-5 h-5 text-emerald-400" />
                <div>
                  <div className="text-white font-semibold">Advanced settings</div>
                  <div className="text-slate-400 text-sm">
                    High latitude rules and time offsets
                  </div>
                </div>
              </div>
              <svg
                className="w-5 h-5 text-slate-400 transition-transform group-open:rotate-180"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </summary>
 
            <div className="mt-4 space-y-6 p-5 rounded-xl border border-slate-700/50 bg-slate-800/20">
              {/* High Latitude Mode */}
              <div>
                <Label className="text-white mb-2 block text-sm font-medium">
                  High latitude rule
                </Label>
                <Select
                  value={highLatitudeMode}
                  onValueChange={(value: string) =>
                    setHighLatitudeMode(value as HighLatitudeMode)
                  }
                >
                  <SelectTrigger className="bg-slate-800/60 border-slate-700/60 text-white h-11">
                    <SelectValue placeholder="Select high latitude rule" />
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
                  Only relevant for locations above 48° latitude where twilight
                  doesn&apos;t occur.
                </p>
              </div>
 
              {/* Timing Offsets */}
              <div>
                <div className="mb-4">
                  <div className="text-white font-medium mb-1">
                    Prayer time adjustments
                  </div>
                  <p className="text-slate-400 text-sm leading-relaxed">
                    Add minutes to each prayer time to match your local mosque or
                    community.
                  </p>
                </div>
 
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {PRAYERS.map((p) => (
                    <div
                      key={p}
                      className="flex items-center justify-between gap-3 p-3 rounded-lg bg-slate-800/40 border border-slate-700/40"
                    >
                      <Label className="text-slate-200 capitalize font-medium text-sm">
                        {p}
                      </Label>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          min={0}
                          step={1}
                          inputMode="numeric"
                          className="w-20 bg-slate-900/60 border-slate-700/60 text-white h-9 text-center"
                          value={offsets[p]}
                          onChange={(e) => updateOffset(p, e.target.value)}
                          onBlur={(e) => updateOffset(p, e.target.value)}
                        />
                        <span className="text-slate-500 text-xs">min</span>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-xs text-slate-500">
                  Offsets cannot be negative. These values are saved and used
                  consistently across your app.
                </p>
              </div>
            </div>
          </details>
 
          {/* Info Box */}
          <div className="mb-8 rounded-xl border border-slate-700/50 bg-slate-800/30 p-4">
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
              <div className="flex-1">
                <div className="text-white text-sm font-medium mb-1">
                  These settings are saved to your account
                </div>
                <p className="text-slate-400 text-sm leading-relaxed">
                  You can adjust these anytime from the Settings page after completing
                  onboarding.
                </p>
              </div>
            </div>
          </div>
 
          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-3">
            <Button
              variant="outline"
              onClick={() => navigate("/onboarding/step3")}
              className="flex-1 border-slate-700 text-slate-300 hover:bg-slate-800 h-11 touch-manipulation active:bg-slate-800"
              disabled={saving}
            >
              Back
            </Button>
            <Button
              onClick={handleContinue}
              className="flex-1 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white h-11 font-medium touch-manipulation active:opacity-90"
              disabled={saving}
            >
              {saving ? "Saving settings…" : "Continue to devices"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}