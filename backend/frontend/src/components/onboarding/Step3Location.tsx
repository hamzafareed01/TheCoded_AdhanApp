import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Logo } from '../shared/Logo';
import { ProgressIndicator } from '../shared/ProgressIndicator';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { Input } from '../ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { Switch } from '../ui/switch';

type LocationSettings = {
  country: 'US' | 'PK';
  city: string;
  timezone: string;
  useMosqueLocation: boolean;
};

type Step3LocationProps = {
  onboardingData: any;
  setOnboardingData: (data: any) => void;
};

// Minimal real coordinates for major cities (can expand later)
const CITY_COORDS: Record<string, { lat: number; lng: number; timezone: string }> = {
  'chicago,us': { lat: 41.8781, lng: -87.6298, timezone: 'America/Chicago' },
  'karachi,pk': { lat: 24.8607, lng: 67.0011, timezone: 'Asia/Karachi' },
  'lahore,pk': { lat: 31.5204, lng: 74.3587, timezone: 'Asia/Karachi' },
  'islamabad,pk': { lat: 33.6844, lng: 73.0479, timezone: 'Asia/Karachi' },
};

export default function Step3Location({
  onboardingData,
  setOnboardingData,
}: Step3LocationProps) {
  const navigate = useNavigate();

  const initialCountry: 'US' | 'PK' =
    onboardingData.location?.country === 'PK' ? 'PK' : 'US';

  const [location, setLocation] = useState<LocationSettings>({
    country: initialCountry,
    city:
      onboardingData.location?.city ??
      (initialCountry === 'PK' ? 'Karachi' : 'Chicago'),
    timezone:
      onboardingData.location?.timezone ??
      (initialCountry === 'PK' ? 'Asia/Karachi' : 'America/Chicago'),
    useMosqueLocation:
      onboardingData.location?.useMosqueLocation ?? true,
  });

  const handleCountryChange = (value: 'US' | 'PK') => {
    let nextTimezone = location.timezone;
    let nextCity = location.city;

    if (value === 'US') {
      nextTimezone = 'America/Chicago';
      if (location.country !== 'US') {
        nextCity = 'Chicago';
      }
    } else if (value === 'PK') {
      nextTimezone = 'Asia/Karachi';
      if (location.country !== 'PK') {
        nextCity = 'Karachi';
      }
    }

    setLocation({
      ...location,
      country: value,
      city: nextCity,
      timezone: nextTimezone,
    });
  };

  const handleNext = () => {
    setOnboardingData({
      ...onboardingData,
      location,
    });
    navigate('/onboarding/step4');
  };

  return (
    <div className="min-h-screen bg-slate-950 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <Logo className="mb-8" />
        <ProgressIndicator currentStep={3} totalSteps={6} />

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 md:p-12">
          <h1 className="text-white mb-4">Where do you live?</h1>
          <p className="text-slate-300 mb-8">
            We use your location and timezone to calculate accurate prayer
            times. You can choose United States or Pakistan for now.
          </p>

          <div className="space-y-6 mb-8">
            {/* Country */}
            <div>
              <Label htmlFor="country" className="text-white mb-2 block">
                Country
              </Label>
              <Select
                value={location.country}
                onValueChange={(value: string) =>
                  handleCountryChange(value as 'US' | 'PK')
                }
              >
                <SelectTrigger
                  id="country"
                  className="bg-slate-800 border-slate-700 text-white"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  <SelectItem value="US">United States</SelectItem>
                  <SelectItem value="PK">Pakistan</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* City */}
            <div>
              <Label htmlFor="city" className="text-white mb-2 block">
                City
              </Label>
              <Input
                id="city"
                value={location.city}
                onChange={(e) =>
                  setLocation({ ...location, city: e.target.value })
                }
                className="bg-slate-800 border-slate-700 text-white"
                placeholder={
                  location.country === 'PK' ? 'Karachi' : 'Chicago'
                }
              />
            </div>

            {/* Timezone */}
            <div>
              <Label htmlFor="timezone" className="text-white mb-2 block">
                Timezone
              </Label>
              <Select
                value={location.timezone}
                onValueChange={(value: string) =>
                  setLocation({ ...location, timezone: value })
                }
              >
                <SelectTrigger
                  id="timezone"
                  className="bg-slate-800 border-slate-700 text-white"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  {/* US examples */}
                  <SelectItem value="America/Chicago">
                    America/Chicago (Central)
                  </SelectItem>
                  <SelectItem value="America/New_York">
                    America/New_York (Eastern)
                  </SelectItem>

                  {/* Pakistan */}
                  <SelectItem value="Asia/Karachi">
                    Asia/Karachi (Pakistan Standard Time)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Use mosque location toggle */}
            <div className="flex items-center justify-between gap-4 p-4 bg-slate-800/40 rounded-xl border border-slate-700">
              <div>
                <p className="text-white mb-1">Use mosque location</p>
                <p className="text-slate-400 text-sm">
                  When you pick a mosque later, we will use that mosque&apos;s
                  coordinates to fine-tune your prayer times.
                </p>
              </div>
              <Switch
                checked={location.useMosqueLocation}
                onCheckedChange={(checked: boolean) =>
                  setLocation({ ...location, useMosqueLocation: checked })
                }
              />
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
