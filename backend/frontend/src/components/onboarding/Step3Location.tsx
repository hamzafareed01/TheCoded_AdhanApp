import { useMemo, useState } from "react";
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
import { apiFetch } from "../../lib/api";

type SupportedCountry = "US" | "PK";

type LocationSettings = {
  country: SupportedCountry;
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

const COUNTRY_DEFAULTS: Record<SupportedCountry, { city: string; timezone: string }> = {
  US: {
    city: "Chicago",
    timezone: "America/Chicago",
  },
  PK: {
    city: "Karachi",
    timezone: "Asia/Karachi",
  },
};

const TIMEZONE_OPTIONS = [
  { value: "America/New_York", label: "America/New_York (Eastern)" },
  { value: "America/Chicago", label: "America/Chicago (Central)" },
  { value: "America/Denver", label: "America/Denver (Mountain)" },
  { value: "America/Los_Angeles", label: "America/Los_Angeles (Pacific)" },
  { value: "America/Anchorage", label: "America/Anchorage (Alaska)" },
  { value: "Pacific/Honolulu", label: "Pacific/Honolulu (Hawaii)" },
  { value: "Asia/Karachi", label: "Asia/Karachi (Pakistan Standard Time)" },
];

function normalizeCity(value: string) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function makeResolvedKey(country: SupportedCountry, city: string) {
  return `${country}::${normalizeCity(city).toLowerCase()}`;
}

export default function Step3Location({
  onboardingData,
  setOnboardingData,
}: Step3LocationProps) {
  const navigate = useNavigate();

  const initialCountry: SupportedCountry =
    onboardingData?.location?.country === "PK" ? "PK" : "US";

  const initialCity =
    onboardingData?.location?.city || COUNTRY_DEFAULTS[initialCountry].city;

  const initialTimezone =
    onboardingData?.location?.timezone || COUNTRY_DEFAULTS[initialCountry].timezone;

  const initialLatitude =
    typeof onboardingData?.location?.latitude === "number"
      ? onboardingData.location.latitude
      : undefined;

  const initialLongitude =
    typeof onboardingData?.location?.longitude === "number"
      ? onboardingData.location.longitude
      : undefined;

  const [location, setLocation] = useState<LocationSettings>({
    country: initialCountry,
    city: initialCity,
    timezone: initialTimezone,
    useMosqueLocation: onboardingData?.location?.useMosqueLocation ?? true,
    latitude: initialLatitude,
    longitude: initialLongitude,
  });

  const [geocoding, setGeocoding] = useState(false);
  const [geocodeError, setGeocodeError] = useState<string | null>(null);
  const [resolvedKey, setResolvedKey] = useState<string | null>(
    initialLatitude != null && initialLongitude != null
      ? makeResolvedKey(initialCountry, initialCity)
      : null
  );
  const [resolvedMessage, setResolvedMessage] = useState<string | null>(
    initialLatitude != null && initialLongitude != null
      ? `Coordinates loaded: ${initialLatitude.toFixed(5)}, ${initialLongitude.toFixed(5)}`
      : null
  );

  const currentCityNormalized = useMemo(
    () => normalizeCity(location.city),
    [location.city]
  );

  const currentLookupKey = useMemo(
    () => makeResolvedKey(location.country, currentCityNormalized),
    [location.country, currentCityNormalized]
  );

  const clearResolvedCoordinates = () => {
    setResolvedKey(null);
    setResolvedMessage(null);
    setLocation((prev) => ({
      ...prev,
      latitude: undefined,
      longitude: undefined,
    }));
  };

  const handleCountryChange = (value: SupportedCountry) => {
    const defaults = COUNTRY_DEFAULTS[value];

    setLocation((prev) => ({
      ...prev,
      country: value,
      city: defaults.city,
      timezone: defaults.timezone,
      latitude: undefined,
      longitude: undefined,
    }));

    setGeocodeError(null);
    setResolvedKey(null);
    setResolvedMessage(null);
  };

  const handleCityChange = (value: string) => {
    setLocation((prev) => ({
      ...prev,
      city: value,
    }));

    if (resolvedKey) {
      clearResolvedCoordinates();
    }
    setGeocodeError(null);
  };

  const handleTimezoneChange = (value: string) => {
    setLocation((prev) => ({
      ...prev,
      timezone: value,
    }));
  };

  const runGeocode = async (loc: LocationSettings) => {
    setGeocodeError(null);

    const cityTrimmed = normalizeCity(loc.city);
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

      const res = await apiFetch(`/api/geocode?${params.toString()}`);
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        const message =
          data?.error ||
          "Could not look up coordinates for this city. Please try again.";
        setGeocodeError(message);
        return null;
      }

      const lat = typeof data?.lat === "number" ? data.lat : undefined;
      const lng = typeof data?.lng === "number" ? data.lng : undefined;

      if (lat == null || lng == null) {
        setGeocodeError(
          "The geocoding service did not return valid coordinates for this city."
        );
        return null;
      }

      return {
        lat,
        lng,
        formatted: data?.formatted || cityTrimmed,
        geocodedTimezone:
          typeof data?.timezone === "string" ? data.timezone : undefined,
      };
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
    const cityTrimmed = normalizeCity(location.city);
    if (!cityTrimmed) {
      setGeocodeError("Please enter a city name.");
      return;
    }

    if (!location.timezone) {
      setGeocodeError("Please select a timezone.");
      return;
    }

    let lat = location.latitude;
    let lng = location.longitude;

    if (resolvedKey !== currentLookupKey || lat == null || lng == null) {
      const result = await runGeocode({
        ...location,
        city: cityTrimmed,
      });

      if (!result) return;

      lat = result.lat;
      lng = result.lng;

      setResolvedKey(currentLookupKey);
      setResolvedMessage(
        `Coordinates confirmed for ${result.formatted}: ${result.lat.toFixed(
          5
        )}, ${result.lng.toFixed(5)}`
      );
    }

    const updatedLocation: LocationSettings = {
      ...location,
      city: cityTrimmed,
      latitude: lat,
      longitude: lng,
      timezone: location.timezone,
    };

    setLocation(updatedLocation);
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
          <h1 className="text-white mb-4">Where should prayer times be based?</h1>
          <p className="text-slate-300 mb-8">
            Choose the country profile, city, and timezone for your prayer
            schedule. We will look up real coordinates for the city before you continue.
          </p>

          <div className="space-y-6 mb-8">
            <div>
              <Label htmlFor="country" className="text-white mb-2 block">
                Country
              </Label>
              <Select
                value={location.country}
                onValueChange={(value: string) =>
                  handleCountryChange(value as SupportedCountry)
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

            <div>
              <Label htmlFor="city" className="text-white mb-2 block">
                City
              </Label>
              <Input
                id="city"
                value={location.city}
                onChange={(e) => handleCityChange(e.target.value)}
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
                  Looking up real coordinates for this city…
                </p>
              )}
              {!geocoding && !geocodeError && resolvedMessage && (
                <p className="mt-2 text-xs text-emerald-400">{resolvedMessage}</p>
              )}
            </div>

            <div>
              <Label htmlFor="timezone" className="text-white mb-2 block">
                Timezone
              </Label>
              <Select
                value={location.timezone}
                onValueChange={(value: string) => handleTimezoneChange(value)}
              >
                <SelectTrigger
                  id="timezone"
                  className="bg-slate-800 border-slate-700 text-white"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  {TIMEZONE_OPTIONS.map((tz) => (
                    <SelectItem key={tz.value} value={tz.value}>
                      {tz.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-2 text-xs text-slate-400">
                Your selected timezone will be saved as-is. City lookup is used for coordinates.
              </p>
            </div>

            <div className="flex items-center justify-between gap-4 p-4 bg-slate-800/40 rounded-xl border border-slate-700">
              <div>
                <p className="text-white mb-1">Use mosque location later</p>
                <p className="text-slate-400 text-sm">
                  If you choose a mosque later, its real coordinates can be used
                  to fine-tune prayer times.
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