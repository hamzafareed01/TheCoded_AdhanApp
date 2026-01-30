/**
 * Step 4 – Prayer Settings (Onboarding)
 *
 * PURPOSE:
 * - Let the user choose between Sunni and Shia
 * - If Sunni:
 *    - Default: Hanafi + ISNA
 *    - Allow all Sunni calculation methods
 * - If Shia:
 *    - Let user choose Jafari or Tehran
 *    - Force Shia mode ON
 *    - Hide Sunni-only controls (Asr madhhab)
 *
 * IMPORTANT:
 * - calculationMethod stores BOTH Sunni + Shia methods
 * - shia boolean is the mode switch used by Dashboard + Backend
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Logo } from '../shared/Logo';
import { ProgressIndicator } from '../shared/ProgressIndicator';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from '../ui/select';

type PrayerSettings = {
  madhab: 'sunni' | 'shia';
  shia: boolean;
  madhhab: 'hanafi' | 'shafi';
  calculationMethod: string;
  highLatitudeMethod: string;
};

type Step4PrayerSettingsProps = {
  onboardingData: any;
  setOnboardingData: (data: any) => void;
};

// Sunni + Shia calculation methods
const SUNNI_METHODS = [
  { value: 'isna', label: 'ISNA (North America)' },
  { value: 'mwl', label: 'Muslim World League' },
  { value: 'karachi', label: 'Karachi' },
  { value: 'egypt', label: 'Egyptian Authority' },
  { value: 'umm-al-qura', label: 'Umm al-Qura (Makkah)' },
  { value: 'moonsighting', label: 'Moonsighting Committee' },
];

const SHIA_METHODS = [
  { value: 'jafari', label: 'Jafari (Shia)' },
  { value: 'tehran', label: 'Tehran (Shia)' },
];

export default function Step4PrayerSettings({
  onboardingData,
  setOnboardingData,
}: Step4PrayerSettingsProps) {
  const navigate = useNavigate();

  // 🔹 Initialize from onboardingData or defaults
  const [settings, setSettings] = useState<PrayerSettings>(() => ({
    madhab: onboardingData.prayerSettings?.madhab ?? 'sunni',
    shia: onboardingData.prayerSettings?.shia ?? false,
    madhhab: onboardingData.prayerSettings?.madhhab ?? 'hanafi',
    calculationMethod:
      onboardingData.prayerSettings?.calculationMethod ?? 'isna',
    highLatitudeMethod:
      onboardingData.prayerSettings?.highLatitudeMethod ?? 'auto',
  }));

  /**
   * Handle Sunni ↔ Shia switch
   */
  const handleMadhabChange = (value: 'sunni' | 'shia') => {
    if (value === 'shia') {
      // ✅ Switch to Shia mode
      setSettings({
        madhab: 'shia',
        shia: true,
        madhhab: 'shafi', // Asr madhhab irrelevant for Shia
        calculationMethod: 'jafari', // default Shia method
        highLatitudeMethod: 'auto',
      });
    } else {
      // ✅ Switch back to Sunni defaults
      setSettings({
        madhab: 'sunni',
        shia: false,
        madhhab: 'hanafi',
        calculationMethod: 'isna',
        highLatitudeMethod: 'auto',
      });
    }
  };

  /**
   * Save & continue
   */
  const handleNext = () => {
    setOnboardingData({
      ...onboardingData,
      prayerSettings: {
        madhab: settings.madhab,
        shia: settings.shia,
        madhhab: settings.madhhab,
        calculationMethod: settings.calculationMethod,
        highLatitudeMethod: settings.highLatitudeMethod,
      },
    });

    navigate('/onboarding/step5');
  };

  return (
    <div className="min-h-screen bg-slate-950 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <Logo className="mb-8" />
        <ProgressIndicator currentStep={4} totalSteps={6} />

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 md:p-12">
          <h1 className="text-white mb-4">Prayer calculation preferences</h1>
          <p className="text-slate-300 mb-8">
            Choose how prayer times should be calculated.
          </p>

          <div className="space-y-6">
            {/* Sunni / Shia selector */}
            <div>
              <Label className="text-white mb-2 block">Fiqh</Label>
              <Select
                value={settings.madhab}
                onValueChange={(v: 'sunni' | 'shia') =>
                  handleMadhabChange(v)
                }
              >
                <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  <SelectItem value="sunni">Sunni</SelectItem>
                  <SelectItem value="shia">Shia (Jafari)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Calculation method */}
            <div>
              <Label className="text-white mb-2 block">
                Calculation method
              </Label>
              <Select
                value={settings.calculationMethod}
                onValueChange={(v: string) =>
                  setSettings((prev) => ({
                    ...prev!,
                    calculationMethod: v,
                  }))
                }
              >
                <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  {settings.shia
                    ? SHIA_METHODS.map((m) => (
                      <SelectItem key={m.value} value={m.value}>
                        {m.label}
                      </SelectItem>
                    ))
                    : SUNNI_METHODS.map((m) => (
                      <SelectItem key={m.value} value={m.value}>
                        {m.label}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            {/* Asr madhhab (Sunni only) */}
            {!settings.shia && (
              <div>
                <Label className="text-white mb-2 block">
                  Asr madhhab
                </Label>
                <Select
                  value={settings.madhhab}
                  onValueChange={(v: 'hanafi' | 'shafi') =>
                    setSettings((prev) => ({
                      ...prev!,
                      madhhab: v,
                    }))
                  }
                >
                  <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700">
                    <SelectItem value="hanafi">Hanafi</SelectItem>
                    <SelectItem value="shafi">Standard (Shafi)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="flex gap-4 mt-10">
            <Button
              onClick={() => navigate('/onboarding/step3')}
              variant="outline"
              className="flex-1 border-slate-700 text-slate-300 hover:bg-slate-800"
              size="lg"
            >
              Back
            </Button>
            <Button
              onClick={handleNext}
              className="flex-1 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white"
              size="lg"
            >
              Next
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
