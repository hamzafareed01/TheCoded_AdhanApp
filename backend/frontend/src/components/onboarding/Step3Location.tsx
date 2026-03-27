import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Logo } from "../shared/Logo";
import { ProgressIndicator } from "../shared/ProgressIndicator";
import { Button } from "../ui/button";
import { Label } from "../ui/label";
import { Input } from "../ui/input";
import { Switch } from "../ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { apiFetch } from "../../lib/api";
import { LocateFixed, MapPin } from "lucide-react";

type LocationSettings = {
  country: string;
  city: string;
  timezone: string;
  useMosqueLocation: boolean;
  latitude?: number;
  longitude?: number;
};

type OnboardingData = {
  location?: Partial<LocationSettings>;
  [key: string]: unknown;
};

type Step3LocationProps = {
  onboardingData: OnboardingData;
  setOnboardingData: (data: OnboardingData) => void;
};

type CountryOption = {
  code: string;
  label: string;
};

const COUNTRIES: CountryOption[] = [
  { code: "US", label: "United States" },
  { code: "CA", label: "Canada" },
  { code: "GB", label: "United Kingdom" },
  { code: "IN", label: "India" },
  { code: "PK", label: "Pakistan" },
  { code: "BD", label: "Bangladesh" },
  { code: "AE", label: "United Arab Emirates" },
  { code: "SA", label: "Saudi Arabia" },
  { code: "QA", label: "Qatar" },
  { code: "KW", label: "Kuwait" },
  { code: "OM", label: "Oman" },
  { code: "BH", label: "Bahrain" },
  { code: "TR", label: "Turkey" },
  { code: "EG", label: "Egypt" },
  { code: "MY", label: "Malaysia" },
  { code: "SG", label: "Singapore" },
  { code: "AU", label: "Australia" },
  { code: "NZ", label: "New Zealand" },
  { code: "DE", label: "Germany" },
  { code: "FR", label: "France" },
];

function normalizeCity(value: string) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function normalizeCountry(value: string) {
  const raw = String(value || "").trim().replace(/\s+/g, " ");
  if (/^[A-Za-z]{2}$/.test(raw)) {
    return raw.toUpperCase();
  }
  return raw;
}

function normalizeTimezone(value: string) {
  return String(value || "").trim();
}

function makeResolvedKey(country: string, city: string) {
  return `${normalizeCountry(country).toLowerCase()}::${normalizeCity(city).toLowerCase()}`;
}

function getBrowserTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "Etc/UTC";
  } catch {
    return "Etc/UTC";
  }
}

export default function Step3Location({
  onboardingData,
  setOnboardingData,
}: Step3LocationProps) {
  const navigate = useNavigate();

  const initialCountry = normalizeCountry(onboardingData?.location?.country || "US");
  const initialCity = normalizeCity(onboardingData?.location?.city || "Chicago");
  const initialTimezone = normalizeTimezone(
    onboardingData?.location?.timezone || getBrowserTimezone()
  );
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

  const [timezoneManuallyEdited, setTimezoneManuallyEdited] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [usingDeviceLocation, setUsingDeviceLocation] = useState(false);
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

  const currentCountryNormalized = useMemo(
    () => normalizeCountry(location.country),
    [location.country]
  );

  const currentLookupKey = useMemo(
    () => makeResolvedKey(currentCountryNormalized, currentCityNormalized),
    [currentCountryNormalized, currentCityNormalized]
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

  const handleCountryChange = (value: string) => {
    setLocation((prev) => ({
      ...prev,
      country: value,
    }));
    setTimezoneManuallyEdited(false);
    if (resolvedKey) clearResolvedCoordinates();
    setGeocodeError(null);
  };

  const handleCityChange = (value: string) => {
    setLocation((prev) => ({
      ...prev,
      city: value,
    }));
    if (resolvedKey) clearResolvedCoordinates();
    setGeocodeError(null);
  };

  const handleTimezoneChange = (value: string) => {
    setTimezoneManuallyEdited(true);
    setLocation((prev) => ({
      ...prev,
      timezone: value,
    }));
  };

  const runGeocode = async (loc: LocationSettings) => {
    setGeocodeError(null);

    const cityTrimmed = normalizeCity(loc.city);
    const countryTrimmed = normalizeCountry(loc.country);

    if (!cityTrimmed) {
      setGeocodeError("Please enter a city.");
      return null;
    }

    if (!countryTrimmed) {
      setGeocodeError("Please choose a country.");
      return null;
    }

    setGeocoding(true);

    try {
      const params = new URLSearchParams({
        city: cityTrimmed,
        country: countryTrimmed,
      });

      const res = await apiFetch(`/api/geocode?${params.toString()}`);
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        const message =
          typeof data?.error === "string"
            ? data.error
            : "Could not look up coordinates for this location. Please try again.";
        setGeocodeError(message);
        return null;
      }

      const lat = typeof data?.lat === "number" ? data.lat : undefined;
      const lng = typeof data?.lng === "number" ? data.lng : undefined;
      const geocodedTimezone =
        typeof data?.timezone === "string" ? data.timezone.trim() : undefined;

      if (lat == null || lng == null) {
        setGeocodeError(
          "The geocoding service did not return valid coordinates for this location."
        );
        return null;
      }

      return {
        lat,
        lng,
        city: cityTrimmed,
        country: countryTrimmed,
        formatted:
          typeof data?.formatted === "string" && data.formatted.trim()
            ? data.formatted
            : `${cityTrimmed}, ${countryTrimmed}`,
        geocodedTimezone,
      };
    } catch (err) {
      console.error("Geocoding request failed", err);
      setGeocodeError(
        "Could not reach the geocoding service. Check your connection and try again."
      );
      return null;
    } finally {
      setGeocoding(false);
    }
  };

  const handleUseDeviceLocation = async () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGeocodeError("Device location is not available in this browser.");
      return;
    }

    setUsingDeviceLocation(true);
    setGeocodeError(null);
    setResolvedMessage(null);

    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 0,
        });
      });

      const lat = position.coords.latitude;
      const lng = position.coords.longitude;

      const params = new URLSearchParams({
        lat: String(lat),
        lng: String(lng),
      });

      const res = await apiFetch(`/api/geocode?${params.toString()}`);
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(
          typeof data?.error === "string"
            ? data.error
            : "Could not resolve your device location."
        );
      }

      const reverseCity = normalizeCity(
        String(data?.city || data?.query || location.city || "")
      );
      const reverseCountry = normalizeCountry(
        String(data?.countryCode || data?.country || location.country || "US")
      );
      const reverseTimezone = normalizeTimezone(
        String(data?.timezone || location.timezone || getBrowserTimezone())
      );

      setLocation((prev) => ({
        ...prev,
        city: reverseCity || prev.city,
        country: reverseCountry || prev.country,
        timezone: reverseTimezone || prev.timezone,
        latitude: lat,
        longitude: lng,
      }));
      setResolvedKey(makeResolvedKey(reverseCountry, reverseCity || location.city));
      setResolvedMessage(
        `Using device location${
          data?.formatted ? ` · ${data.formatted}` : ""
        } · ${lat.toFixed(5)}, ${lng.toFixed(5)}`
      );
    } catch (err) {
      console.error(err);
      setGeocodeError(
        err instanceof Error
          ? err.message
          : "Could not access your device location."
      );
    } finally {
      setUsingDeviceLocation(false);
    }
  };

  const handleNext = async () => {
    const cityTrimmed = normalizeCity(location.city);
    const countryTrimmed = normalizeCountry(location.country);
    const timezoneTrimmed = normalizeTimezone(location.timezone);

    if (!cityTrimmed) {
      setGeocodeError("Please enter a city.");
      return;
    }

    if (!countryTrimmed) {
      setGeocodeError("Please choose a country.");
      return;
    }

    let lat = location.latitude;
    let lng = location.longitude;
    let finalTimezone = timezoneTrimmed;

    if (resolvedKey !== currentLookupKey || lat == null || lng == null) {
      const result = await runGeocode({
        ...location,
        city: cityTrimmed,
        country: countryTrimmed,
      });

      if (!result) return;

      lat = result.lat;
      lng = result.lng;

      if ((!timezoneTrimmed || !timezoneManuallyEdited) && result.geocodedTimezone) {
        finalTimezone = result.geocodedTimezone;
      }

      setResolvedKey(currentLookupKey);
      setResolvedMessage(
        `Coordinates confirmed for ${result.formatted}: ${result.lat.toFixed(5)}, ${result.lng.toFixed(5)}${
          result.geocodedTimezone ? ` · Timezone: ${result.geocodedTimezone}` : ""
        }`
      );
    }

    if (!finalTimezone) {
      setGeocodeError("Please enter a timezone.");
      return;
    }

    const updatedLocation: LocationSettings = {
      ...location,
      country: countryTrimmed,
      city: cityTrimmed,
      timezone: finalTimezone,
      latitude: lat,
      longitude: lng,
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
            Choose your country from a list, enter your city, or use your device location for faster setup.
          </p>

          <div className="space-y-6 mb-8">
            <div className="rounded-xl border border-slate-700 bg-slate-800/40 p-4">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                  <div className="text-white font-medium flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-emerald-400" />
                    Quick location setup
                  </div>
                  <p className="text-slate-400 text-sm mt-1">
                    Use your current device location to auto-fill city, country, timezone, and coordinates.
                  </p>
                </div>
                <Button
                  type="button"
                  onClick={handleUseDeviceLocation}
                  disabled={usingDeviceLocation || geocoding}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  <LocateFixed className="w-4 h-4 mr-2" />
                  {usingDeviceLocation ? "Locating…" : "Use device location"}
                </Button>
              </div>
            </div>

            <div>
              <Label htmlFor="country" className="text-white mb-2 block">
                Country or region
              </Label>
              <Select value={location.country} onValueChange={handleCountryChange}>
                <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                  <SelectValue placeholder="Select country" />
                </SelectTrigger>
                <SelectContent className="bg-slate-900 border-slate-700 text-slate-100 max-h-72">
                  {!COUNTRIES.some((country) => country.code === location.country) && (
                    <SelectItem value={location.country}>{location.country}</SelectItem>
                  )}
                  {COUNTRIES.map((country) => (
                    <SelectItem key={country.code} value={country.code}>
                      {country.label}
                    </SelectItem>
                  ))}
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
                placeholder="Example: Chicago, Karachi, London, Dubai"
              />
              {geocodeError && <p className="mt-2 text-xs text-red-400">{geocodeError}</p>}
              {geocoding && !geocodeError && (
                <p className="mt-2 text-xs text-slate-400">
                  Looking up real coordinates for this location…
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
              <Input
                id="timezone"
                value={location.timezone}
                onChange={(e) => handleTimezoneChange(e.target.value)}
                className="bg-slate-800 border-slate-700 text-white"
                placeholder="Example: America/Chicago, Asia/Karachi, Europe/London"
              />
              <p className="mt-2 text-xs text-slate-400">
                This can be auto-filled from city lookup or device location, but you can still override it manually.
              </p>
            </div>

            <div className="flex items-center justify-between gap-4 p-4 bg-slate-800/40 rounded-xl border border-slate-700">
              <div>
                <p className="text-white mb-1">Use mosque location later</p>
                <p className="text-slate-400 text-sm">
                  If you choose a mosque later, its real coordinates can be used to fine-tune prayer times.
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
              disabled={geocoding || usingDeviceLocation}
            >
              Back
            </Button>
            <Button
              onClick={handleNext}
              className="flex-1 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white"
              size="lg"
              disabled={geocoding || usingDeviceLocation}
            >
              {geocoding ? "Checking location…" : "Next"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
