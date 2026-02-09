import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Logo } from '../shared/Logo';
import { ProgressIndicator } from '../shared/ProgressIndicator';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { RadioGroup, RadioGroupItem } from '../ui/radio-group';
import { Label } from '../ui/label';
import { Settings2 } from 'lucide-react';

export type PrayerMethod =
  | 'isna'
  | 'karachi'
  | 'mwl'
  | 'makkah'
  | 'egypt'
  | 'ummAlQura';

export type HighLatitudeMode =
  | 'automatic'
  | 'middle_of_the_night'
  | 'one_seventh'
  | 'angle_based';

type Step4PrayerSettingsProps = {
  onboardingData: any;
  setOnboardingData: (data: any) => void;
};

export default function Step4PrayerSettings({
  onboardingData,
  setOnboardingData
}: Step4PrayerSettingsProps) {
  const navigate = useNavigate();

  const existing = onboardingData?.prayerSettings;

  const [calculationMethod, setCalculationMethod] = useState<PrayerMethod>('isna');
  const [madhab, setMadhab] = useState<'sunni' | 'shia'>('sunni'); // sunni/shia
  const [asrMethod, setAsrMethod] = useState<'hanafi' | 'standard'>('hanafi'); // hanafi/standard
  const [highLatitudeMode, setHighLatitudeMode] = useState<HighLatitudeMode>('automatic');

  useEffect(() => {
    if (!existing) return;

    if (existing.calculationMethod) setCalculationMethod(existing.calculationMethod);
    if (existing.madhab) setMadhab(existing.madhab);
    if (existing.asrMethod) setAsrMethod(existing.asrMethod);
    if (existing.highLatitudeMode) setHighLatitudeMode(existing.highLatitudeMode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleNext = () => {
    setOnboardingData({
      ...onboardingData,
      prayerSettings: {
        calculationMethod,
        madhab,
        asrMethod,
        highLatitudeMode
      }
    });

    navigate('/onboarding/step5');
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
                Choose calculation preferences for accurate prayer times.
              </p>
            </div>
            <Badge variant="outline" className="border-emerald-500/30 text-emerald-400">
              Step 4 of 6
            </Badge>
          </div>

          <div className="space-y-8">
            {/* Calculation Method */}
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
                  <SelectItem value="isna">ISNA (North America)</SelectItem>
                  <SelectItem value="mwl">Muslim World League</SelectItem>
                  <SelectItem value="makkah">Makkah</SelectItem>
                  <SelectItem value="egypt">Egyptian Survey</SelectItem>
                  <SelectItem value="karachi">Karachi (Pakistan)</SelectItem>
                  <SelectItem value="ummAlQura">Umm Al-Qura</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Sunni / Shia */}
            <div className="space-y-4">
              <Label className="text-white">School / Preference</Label>
              <RadioGroup
                value={madhab}
                onValueChange={(value: string) => setMadhab(value as 'sunni' | 'shia')}
                className="flex gap-6"
              >
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="sunni" id="sunni" />
                  <Label htmlFor="sunni" className="text-white cursor-pointer">
                    Sunni
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="shia" id="shia" />
                  <Label htmlFor="shia" className="text-white cursor-pointer">
                    Shia
                  </Label>
                </div>
              </RadioGroup>
              <div className="text-sm text-slate-400">
                (Shia affects preferences; method choice also matters.)
              </div>
            </div>

            {/* Asr Method */}
            <div className="space-y-3">
              <Label className="text-white">Asr Method</Label>
              <Select
                value={asrMethod}
                onValueChange={(value: string) => setAsrMethod(value as 'hanafi' | 'standard')}
              >
                <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                  <SelectValue placeholder="Select Asr method" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="hanafi">Hanafi (later Asr)</SelectItem>
                  <SelectItem value="standard">Standard (Shafi)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* High Latitude */}
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
                  <SelectItem value="middle_of_the_night">Middle of the Night</SelectItem>
                  <SelectItem value="one_seventh">One Seventh</SelectItem>
                  <SelectItem value="angle_based">Angle Based</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex justify-between mt-12">
            <Button
              variant="outline"
              onClick={() => navigate('/onboarding/step3')}
              className="border-slate-700 text-white hover:bg-slate-800"
            >
              Back
            </Button>
            <Button onClick={handleNext} className="bg-emerald-600 hover:bg-emerald-700">
              Continue
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
