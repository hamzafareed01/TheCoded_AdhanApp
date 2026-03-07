import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Logo } from "../shared/Logo";
import { ProgressIndicator } from "../shared/ProgressIndicator";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Input } from "../ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { RadioGroup, RadioGroupItem } from "../ui/radio-group";
import { Label } from "../ui/label";
import { Settings2 } from "lucide-react";
import { apiFetch } from "../../lib/api";

type Sect = "SUNNI" | "SHIA";
type PrayerName = "fajr" | "dhuhr" | "asr" | "maghrib" | "isha";

export type PrayerMethod =
  | "isna"
  | "karachi"
  | "mwl"
  | "makkah"
  | "egypt"
  | "ummAlQura";

export type HighLatitudeMode =
  | "automatic"
  | "middle_of_the_night"
  | "one_seventh"
  | "angle_based";

type Step4PrayerSettingsProps = {
  onboardingData: any;
  setOnboardingData: (data: any) => void;
};

type Offsets = Record<PrayerName, number>;

const PRAYERS: PrayerName[] = ["fajr", "dhuhr", "asr", "maghrib", "isha"];

function defaultOffsets(): Offsets {
  return { fajr: 0, dhuhr: 0, asr: 0, maghrib: 0, isha: 0 };
}

async function saveSettings(payload: any) {
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

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [sect, setSect] = useState<Sect>("SUNNI");
  const [calculationMethod, setCalculationMethod] = useState<PrayerMethod>("isna");
  const [madhhab, setMadhhab] = useState<"hanafi" | "shafi">("hanafi");
  const [highLatitudeMode, setHighLatitudeMode] = useState<HighLatitudeMode>("automatic");
  const [offsets, setOffsets] = useState<Offsets>(defaultOffsets());

  useEffect(() => {
    if (existing?.sect) setSect(existing.sect);
    if (existing?.shia === true) setSect("SHIA");
    if (existing?.calculationMethod) setCalculationMethod(existing.calculationMethod);
    if (existing?.madhhab) setMadhhab(existing.madhhab);
    if (existing?.highLatitudeMode) setHighLatitudeMode(existing.highLatitudeMode);
    if (existing?.offsets && typeof existing.offsets === "object") {
      setOffsets({ ...defaultOffsets(), ...existing.offsets });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const calcMethodChoices = useMemo(() => {
    // Presets by sect (editable later)
    if (sect === "SHIA") {
      return [
        { value: "karachi", label: "Karachi" },
        { value: "mwl", label: "Muslim World League" },
        { value: "egypt", label: "Egyptian Survey" },
        { value: "ummAlQura", label: "Umm Al-Qura" },
        { value: "isna", label: "ISNA (North America)" },
        { value: "makkah", label: "Makkah" },
      ] as const;
    }

    return [
      { value: "isna", label: "ISNA (North America)" },
      { value: "mwl", label: "Muslim World League" },
      { value: "makkah", label: "Makkah" },
      { value: "egypt", label: "Egyptian Survey" },
      { value: "karachi", label: "Karachi (Pakistan)" },
      { value: "ummAlQura", label: "Umm Al-Qura" },
    ] as const;
  }, [sect]);

  const handleContinue = async () => {
    setError(null);

    const token = localStorage.getItem("amazon_access_token");
    if (!token) {
      setError("Please connect Amazon in Step 2 before saving prayer settings.");
      return;
    }

    const nextPrayerSettings = {
      sect,
      shia: sect === "SHIA",
      calculationMethod,
      madhhab,
      highLatitudeMode,
      offsets,
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
        globalOffsets: offsets,
      });

      if (!resp.ok) {
        const msg = await resp.text().catch(() => "");
        throw new Error(`Could not save prayer settings (${resp.status}). ${msg}`.trim());
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
            <Badge variant="outline" className="border-emerald-500/30 text-emerald-400">
              Step 4 of 6
            </Badge>
          </div>

          {error && (
            <div className="mb-6 text-sm text-red-400 bg-red-950/40 border border-red-900 rounded-md px-3 py-2">
              {error}
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
                onValueChange={(value: string) => setCalculationMethod(value as PrayerMethod)}
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
              <Select
                value={madhhab}
                onValueChange={(value: string) => setMadhhab(value as "hanafi" | "shafi")}
              >
                <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                  <SelectValue placeholder="Select madhhab" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="hanafi">Hanafi (later Asr)</SelectItem>
                  <SelectItem value="shafi">Shafi / Standard</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3">
              <Label className="text-white">High Latitude Rule</Label>
              <Select
                value={highLatitudeMode}
                onValueChange={(value: string) => setHighLatitudeMode(value as HighLatitudeMode)}
              >
                <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                  <SelectValue placeholder="Select high latitude rule" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="automatic">Automatic</SelectItem>
                  <SelectItem value="middle_of_the_night">Middle of the Night</SelectItem>
                  <SelectItem value="one_seventh">One Seventh</SelectItem>
                  <SelectItem value="angle_based">Angle Based</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="border-t border-slate-800 pt-6">
              <h2 className="text-white text-lg mb-2">Timing offsets (minutes)</h2>
              <p className="text-slate-400 text-sm mb-4">
                Adjust each prayer time slightly (e.g., Fajr +2, Maghrib -1).
              </p>

              <div className="grid md:grid-cols-2 gap-4">
                {PRAYERS.map((p) => (
                  <div key={p} className="flex items-center justify-between gap-3">
                    <Label className="text-slate-200 capitalize">{p}</Label>
                    <Input
                      type="number"
                      className="w-28 bg-slate-800 border-slate-700 text-white"
                      value={offsets[p]}
                      onChange={(e) =>
                        setOffsets((prev) => ({
                          ...prev,
                          [p]: Number(e.target.value || 0),
                        }))
                      }
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
