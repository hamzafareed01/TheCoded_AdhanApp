import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Logo } from '../shared/Logo';
import { ProgressIndicator } from '../shared/ProgressIndicator';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Checkbox } from '../ui/checkbox';

export default function Step3Location({ onboardingData, setOnboardingData }: any) {
  const navigate = useNavigate();
  const [location, setLocation] = useState(onboardingData.location || {
    country: '',
    city: '',
    timezone: '',
    useCurrentLocation: false
  });

  const handleNext = () => {
    setOnboardingData({ ...onboardingData, location });
    navigate('/onboarding/step4');
  };

  const isValid = location.country && location.city && location.timezone;

  return (
    <div className="min-h-screen bg-slate-950 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <Logo className="mb-8" />

        <ProgressIndicator currentStep={3} totalSteps={6} />

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 md:p-12">
          <h1 className="text-white mb-4">Location</h1>
          <p className="text-slate-300 mb-8">
            Set your location to calculate accurate prayer times.
          </p>

          <div className="space-y-6 mb-8">
            <div>
              <Label htmlFor="country" className="text-white mb-2 block">Country</Label>
              <Select
                value={location.country}
                onValueChange={(value) => setLocation({ ...location, country: value })}
              >
                <SelectTrigger id="country" className="bg-slate-800 border-slate-700 text-white">
                  <SelectValue placeholder="Select country" />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  <SelectItem value="us">United States</SelectItem>
                  <SelectItem value="ca">Canada</SelectItem>
                  <SelectItem value="uk">United Kingdom</SelectItem>
                  <SelectItem value="sa">Saudi Arabia</SelectItem>
                  <SelectItem value="ae">United Arab Emirates</SelectItem>
                  <SelectItem value="pk">Pakistan</SelectItem>
                  <SelectItem value="in">India</SelectItem>
                  <SelectItem value="my">Malaysia</SelectItem>
                  <SelectItem value="id">Indonesia</SelectItem>
                  <SelectItem value="tr">Turkey</SelectItem>
                  <SelectItem value="eg">Egypt</SelectItem>
                  <SelectItem value="ma">Morocco</SelectItem>
                  <SelectItem value="dz">Algeria</SelectItem>
                  <SelectItem value="tn">Tunisia</SelectItem>
                  <SelectItem value="jo">Jordan</SelectItem>
                  <SelectItem value="lb">Lebanon</SelectItem>
                  <SelectItem value="sy">Syria</SelectItem>
                  <SelectItem value="iq">Iraq</SelectItem>
                  <SelectItem value="kw">Kuwait</SelectItem>
                  <SelectItem value="qa">Qatar</SelectItem>
                  <SelectItem value="om">Oman</SelectItem>
                  <SelectItem value="bh">Bahrain</SelectItem>
                  <SelectItem value="ye">Yemen</SelectItem>
                  <SelectItem value="bd">Bangladesh</SelectItem>
                  <SelectItem value="af">Afghanistan</SelectItem>
                  <SelectItem value="ir">Iran</SelectItem>
                  <SelectItem value="so">Somalia</SelectItem>
                  <SelectItem value="sd">Sudan</SelectItem>
                  <SelectItem value="ng">Nigeria</SelectItem>
                  <SelectItem value="au">Australia</SelectItem>
                  <SelectItem value="de">Germany</SelectItem>
                  <SelectItem value="fr">France</SelectItem>
                  <SelectItem value="nl">Netherlands</SelectItem>
                  <SelectItem value="se">Sweden</SelectItem>
                  <SelectItem value="no">Norway</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="city" className="text-white mb-2 block">City or ZIP code</Label>
              <Input
                id="city"
                value={location.city}
                onChange={(e) => setLocation({ ...location, city: e.target.value })}
                placeholder="Enter city name or ZIP code"
                className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500"
              />
            </div>

            <div>
              <Label htmlFor="timezone" className="text-white mb-2 block">Timezone</Label>
              <Select
                value={location.timezone}
                onValueChange={(value) => setLocation({ ...location, timezone: value })}
              >
                <SelectTrigger id="timezone" className="bg-slate-800 border-slate-700 text-white">
                  <SelectValue placeholder="Select timezone" />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  <SelectItem value="America/New_York">America/New York (EST/EDT)</SelectItem>
                  <SelectItem value="America/Chicago">America/Chicago (CST/CDT)</SelectItem>
                  <SelectItem value="America/Denver">America/Denver (MST/MDT)</SelectItem>
                  <SelectItem value="America/Los_Angeles">America/Los Angeles (PST/PDT)</SelectItem>
                  <SelectItem value="America/Toronto">America/Toronto</SelectItem>
                  <SelectItem value="Europe/London">Europe/London</SelectItem>
                  <SelectItem value="Asia/Dubai">Asia/Dubai</SelectItem>
                  <SelectItem value="Asia/Riyadh">Asia/Riyadh</SelectItem>
                  <SelectItem value="Asia/Karachi">Asia/Karachi</SelectItem>   {/* 🇵🇰 */}
                  <SelectItem value="Asia/Kolkata">Asia/Kolkata</SelectItem>
                  <SelectItem value="Asia/Kuala_Lumpur">Asia/Kuala_Lumpur</SelectItem>
                  <SelectItem value="Asia/Jakarta">Asia/Jakarta</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2 p-4 bg-slate-800/50 rounded-lg border border-slate-700">
              <Checkbox
                id="use-location"
                checked={location.useCurrentLocation}
                onCheckedChange={(checked) => setLocation({ ...location, useCurrentLocation: checked as boolean })}
              />
              <Label htmlFor="use-location" className="text-white cursor-pointer">
                Use my current location instead
              </Label>
            </div>
          </div>

          <div className="flex gap-4">
            <Button
              onClick={() => navigate('/onboarding/step2')}
              variant="outline"
              className="flex-1 border-slate-700 text-slate-300 hover:bg-slate-800"
              size="lg"
            >
              Back
            </Button>
            <Button
              onClick={handleNext}
              disabled={!isValid}
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