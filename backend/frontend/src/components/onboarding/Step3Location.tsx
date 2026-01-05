import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Logo } from "../shared/Logo";
import { ProgressIndicator } from "../shared/ProgressIndicator";
import { Button } from "../ui/button";
import { Label } from "../ui/label";
import { Input } from "../ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { Switch } from "../ui/switch";

const API_BASE =
  (import.meta as any).env?.VITE_API_BASE ?? "http://localhost:4000";

type LocationSettings = {
  country: "US" | "PK";
  city: string;
  timezone: string;
  useMosqueLocation: boolean;
  latitude?: number;
  longitude?: number;
};

type Step3LocationProps = {
  onboardingData: any;
  setOnboardingData: (data: any) => void;
};

export default function Step3Location({
  onboardingData,
  setOnboardingData,
}: Step3LocationProps) {
  const navigate = useNavigate();

  const initialCountry: "US" | "PK" =
    onboardingData.location?.country === "PK" ? "PK" : "US";

  const [location, setLocation] = useState<LocationSettings>(() => ({
    country: initialCountry,
    city:
      onboardingData.location?.city ??
      (initialCountry === "PK" ? "Karachi" : "Chicago"),
    timezone:
      onboardingData.location?.timezone ??
      (initialCountry === "PK" ? "Asia/Karachi" : "America/Chicago"),
    useMosqueLocation:
      onboardingData.location?.useMosqueLocation ?? true,
    latitude: onboardingData.location?.latitude,
    longitude: onboardingData.location?.longitude,
  }));

  const [geocoding, setGeocoding] = useState(false);
  const [geocodeError, setGeocodeError] = useState<string | null>(null);

  const handleCountryChange = (value: "US" | "PK") => {
    setLocation((prev) => ({
      ...prev,
      country: value,
      city: value === "PK" ? "Karachi" : "Chicago",
      timezone: value === "PK" ? "Asia/Karachi" : "America/Chicago",
      latitude: undefined,
      longitude: undefined,
    }));
    setGeocodeError(null);
  };

  const runGeocode = async (loc: LocationSettings) => {
    setGeocodeError(null);

    const cityTrimmed = loc.city.trim();
    if (!cityTrimmed) {
      setGeocodeError("Please enter a city name.");
      return null;
    }

    setGeocoding(true);
    try {
      const params = new URLSearchParams({
        city: cityTrimmed,
        country: loc.country,
      });
      const res = await fetch(`${API_BASE}/api/geocode?${params.toString()}`);
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        const message =
          data?.error ??
          "Could not look up coordinates for this city. Please try again.";
        setGeocodeError(message);
        return null;
      }

      const lat = data.lat as number | undefined;
      const lng = data.lng as number | undefined;
      const tz = (data.timezone as string | undefined) ?? loc.timezone;

      if (lat == null || lng == null) {
        setGeocodeError(
          "The geocoding service did not return coordinates for this city."
        );
        return null;
      }

      return { lat, lng, timezone: tz };
    } catch (err) {
      console.error("Geocoding request failed", err);
      setGeocodeError(
        "Could not reach the geocoding service. Check your internet connection and try again."
      );
      return null;
    } finally {
      setGeocoding(false);
    }
  };

  const handleNext = async () => {
    const result = await runGeocode(location);
    if (!result) {
      // Do NOT continue with fake coords if geocoding failed
      return;
    }

    const updatedLocation: LocationSettings = {
      ...location,
      latitude: result.lat,
      longitude: result.lng,
      timezone: result.timezone,
    };

    setOnboardingData({
      ...onboardingData,
      location: updatedLocation,
    });

    navigate("/onboarding/step4");
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
            times. You can choose United States or Pakistan for now. We&apos;ll
            look up the real coordinates for your city.
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
                  handleCountryChange(value as "US" | "PK")
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
                  setLocation((prev) => ({ ...prev, city: e.target.value }))
                }
                className="bg-slate-800 border-slate-700 text-white"
                placeholder={
                  location.country === "PK" ? "Karachi" : "Chicago"
                }
              />
              {geocodeError && (
                <p className="mt-2 text-xs text-red-400">{geocodeError}</p>
              )}
              {geocoding && !geocodeError && (
                <p className="mt-2 text-xs text-slate-400">
                  Looking up coordinates for this city…
                </p>
              )}
            </div>

            {/* Timezone */}
            <div>
              <Label htmlFor="timezone" className="text-white mb-2 block">
                Timezone
              </Label>
              <Select
                value={location.timezone}
                onValueChange={(value: string) =>
                  setLocation((prev) => ({ ...prev, timezone: value }))
                }
              >
                <SelectTrigger
                  id="timezone"
                  className="bg-slate-800 border-slate-700 text-white"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  {/* US timezones we support for now */}
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
                  setLocation((prev) => ({
                    ...prev,
                    useMosqueLocation: checked,
                  }))
                }
              />
            </div>
          </div>

          <div className="flex gap-4">
            <Button
              onClick={() => navigate("/onboarding/step2")}
              variant="outline"
              className="flex-1 border-slate-700 text-slate-300 hover:bg-slate-800"
              size="lg"
              disabled={geocoding}
            >
              Back
            </Button>
            <Button
              onClick={handleNext}
              className="flex-1 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white"
              size="lg"
              disabled={geocoding}
            >
              {geocoding ? "Checking city…" : "Next"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
