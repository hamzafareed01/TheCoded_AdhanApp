import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Logo } from '../shared/Logo';
import { ProgressIndicator } from '../shared/ProgressIndicator';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { RadioGroup, RadioGroupItem } from '../ui/radio-group';

export default function Step4PrayerSettings({ onboardingData, setOnboardingData }: any) {
  const navigate = useNavigate();
  const [prayerSettings, setPrayerSettings] = useState(onboardingData.prayerSettings || {
    madhab: 'sunni',
    calculationMethod: 'isna',
    asrMethod: 'standard',
    highLatitudeMode: 'auto'
  });

  const handleNext = () => {
    setOnboardingData({ ...onboardingData, prayerSettings });
    navigate('/onboarding/step5');
  };

  return (
    <div className="min-h-screen bg-slate-950 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <Logo className="mb-8" />
        
        <ProgressIndicator currentStep={4} totalSteps={6} />

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 md:p-12">
          <h1 className="text-white mb-4">Prayer Settings</h1>
          <p className="text-slate-300 mb-8">
            Configure how your prayer times are calculated.
          </p>

          <div className="space-y-8 mb-8">
            {/* Madhab Selection */}
            <div>
              <Label className="text-white mb-3 block">Madhab</Label>
              <RadioGroup 
                value={prayerSettings.madhab}
                onValueChange={(value) => setPrayerSettings({ ...prayerSettings, madhab: value })}
                className="space-y-3"
              >
                <div className="flex items-center gap-3 p-4 bg-slate-800/50 rounded-lg border border-slate-700">
                  <RadioGroupItem value="sunni" id="madhab-sunni" />
                  <Label htmlFor="madhab-sunni" className="text-white cursor-pointer flex-1">
                    Sunni
                  </Label>
                </div>
                <div className="flex items-center gap-3 p-4 bg-slate-800/50 rounded-lg border border-slate-700">
                  <RadioGroupItem value="shia" id="madhab-shia" />
                  <Label htmlFor="madhab-shia" className="text-white cursor-pointer flex-1">
                    Shia (Jafari)
                  </Label>
                </div>
              </RadioGroup>
            </div>

            {/* Calculation Method */}
            <div>
              <Label htmlFor="calc-method" className="text-white mb-2 block">Calculation Method</Label>
              <Select 
                value={prayerSettings.calculationMethod} 
                onValueChange={(value) => setPrayerSettings({ ...prayerSettings, calculationMethod: value })}
              >
                <SelectTrigger id="calc-method" className="bg-slate-800 border-slate-700 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  <SelectItem value="isna">ISNA (recommended for North America)</SelectItem>
                  <SelectItem value="mwl">Muslim World League (MWL)</SelectItem>
                  <SelectItem value="umm-al-qura">Umm al-Qura University</SelectItem>
                  <SelectItem value="karachi">University of Islamic Sciences, Karachi</SelectItem>
                  <SelectItem value="moonsighting">Moonsighting Committee Worldwide</SelectItem>
                  <SelectItem value="other">Other...</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-slate-400 text-sm mt-2">
                Choose how your prayer times are calculated.
              </p>
            </div>

            {/* Asr Method */}
            <div>
              <Label className="text-white mb-3 block">Asr Method</Label>
              <RadioGroup 
                value={prayerSettings.asrMethod}
                onValueChange={(value) => setPrayerSettings({ ...prayerSettings, asrMethod: value })}
                className="space-y-3"
              >
                <div className="flex items-center gap-3 p-4 bg-slate-800/50 rounded-lg border border-slate-700">
                  <RadioGroupItem value="standard" id="asr-standard" />
                  <Label htmlFor="asr-standard" className="text-white cursor-pointer flex-1">
                    Standard (Shafi'i, Maliki, Hanbali)
                  </Label>
                </div>
                <div className="flex items-center gap-3 p-4 bg-slate-800/50 rounded-lg border border-slate-700">
                  <RadioGroupItem value="hanafi" id="asr-hanafi" />
                  <Label htmlFor="asr-hanafi" className="text-white cursor-pointer flex-1">
                    Hanafi
                  </Label>
                </div>
              </RadioGroup>
            </div>

            {/* High Latitude Mode */}
            <div>
              <Label htmlFor="high-lat" className="text-white mb-2 block">High Latitude Mode</Label>
              <Select 
                value={prayerSettings.highLatitudeMode} 
                onValueChange={(value) => setPrayerSettings({ ...prayerSettings, highLatitudeMode: value })}
              >
                <SelectTrigger id="high-lat" className="bg-slate-800 border-slate-700 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  <SelectItem value="auto">Automatic</SelectItem>
                  <SelectItem value="angle">Angle-based</SelectItem>
                  <SelectItem value="midnight">Midnight</SelectItem>
                  <SelectItem value="one-seventh">One-seventh</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex gap-4">
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