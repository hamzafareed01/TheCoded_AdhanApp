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
 
const DEVICE_LOCATION_MAX_ACCURACY_METERS = 250;
 
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
    setLocation((prev) => ({ ...prev, country: value }));
    setTimezoneManuallyEdited(false);
    if (resolvedKey) clearResolvedCoordinates();
    setGeocodeError(null);
  };
 
  const handleCityChange = (value: string) => {
    setLocation((prev) => ({ ...prev, city: value }));
    if (resolvedKey) clearResolvedCoordinates();
    setGeocodeError(null);
  };
 
  const handleTimezoneChange = (value: string) => {
    setTimezoneManuallyEdited(true);
    setLocation((prev) => ({ ...prev, timezone: value }));
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
      const params = new URLSearchParams({ city: cityTrimmed, country: countryTrimmed });
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
      const accuracyMeters =
        typeof position.coords.accuracy === "number" &&
        Number.isFinite(position.coords.accuracy)
          ? Math.round(position.coords.accuracy)
          : null;
 
      if (accuracyMeters != null && accuracyMeters > DEVICE_LOCATION_MAX_ACCURACY_METERS) {
        setGeocodeError(
          `Your device location is currently too approximate (±${accuracyMeters}m). Turn on precise location or enter your city manually before saving coordinates.`
        );
        return;
      }
 
      const params = new URLSearchParams({ lat: String(lat), lng: String(lng) });
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
        `Using device location${data?.formatted ? ` · ${data.formatted}` : ""} · ${lat.toFixed(5)}, ${lng.toFixed(5)}${
          accuracyMeters != null ? ` · Accuracy ±${accuracyMeters}m` : ""
        }`
      );
    } catch (err) {
      console.error(err);
      setGeocodeError(
        err instanceof Error ? err.message : "Could not access your device location."
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
    setOnboardingData({ ...onboardingData, location: updatedLocation });
    navigate("/onboarding/step4");
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
            <ProgressIndicator currentStep={3} totalSteps={6} />
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
            Set your location
          </h1>
          <p className="text-base md:text-lg text-slate-400 leading-relaxed max-w-2xl">
            Your location helps us calculate precise prayer times based on the
            position of the sun in your area.
          </p>
        </div>
 
        {/* Main Content Card */}
        <div className="rounded-3xl border border-slate-800/60 bg-slate-900/40 backdrop-blur-sm p-6 md:p-10">
          {/* Privacy Notice */}
          <div className="mb-7 rounded-xl border border-slate-700/50 bg-slate-800/30 p-4">
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
                    d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                  />
                </svg>
              </div>
              <div className="flex-1">
                <div className="text-white text-sm font-medium mb-1">
                  Your location stays private
                </div>
                <p className="text-slate-400 text-sm leading-relaxed">
                  Location is only used to calculate accurate prayer times. We
                  don&apos;t share or sell your data.
                </p>
              </div>
            </div>
          </div>
 
          {/* Quick Setup Section */}
          <div className="mb-8">
            <h2 className="text-white text-base font-semibold mb-3">Quick setup</h2>
            <div className="rounded-xl border-2 border-emerald-500/20 bg-emerald-500/5 p-5">
              <div className="flex flex-col gap-4">
                <div className="flex items-start gap-3">
                  <div className="rounded-lg bg-emerald-500/10 p-2 mt-0.5">
                    <MapPin className="w-5 h-5 text-emerald-400" />
                  </div>
                  <div className="flex-1">
                    <div className="text-white font-medium mb-1">
                      Use your current location
                    </div>
                    <p className="text-slate-400 text-sm leading-relaxed">
                      Automatically fill in your city, country, timezone, and
                      coordinates for the most accurate results.
                    </p>
                  </div>
                </div>
                <Button
                  type="button"
                  onClick={handleUseDeviceLocation}
                  disabled={usingDeviceLocation || geocoding}
                  className="w-full sm:w-auto bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white h-11 touch-manipulation active:opacity-90"
                >
                  <LocateFixed className="w-4 h-4 mr-2" />
                  {usingDeviceLocation ? "Getting location…" : "Use my location"}
                </Button>
              </div>
            </div>
          </div>
 
          {/* Manual Entry Section */}
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-px flex-1 bg-slate-700/50" />
              <span className="text-slate-500 text-sm">Or enter manually</span>
              <div className="h-px flex-1 bg-slate-700/50" />
            </div>
 
            <div className="space-y-5">
              {/* Country */}
              <div>
                <Label
                  htmlFor="country"
                  className="text-white mb-2 block text-sm font-medium"
                >
                  Country or region
                </Label>
                <Select value={location.country} onValueChange={handleCountryChange}>
                  <SelectTrigger className="bg-slate-800/60 border-slate-700/60 text-white h-11">
                    <SelectValue placeholder="Select country" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-900 border-slate-700 text-slate-100 max-h-72">
                    {!COUNTRIES.some((c) => c.code === location.country) && (
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
 
              {/* City */}
              <div>
                <Label
                  htmlFor="city"
                  className="text-white mb-2 block text-sm font-medium"
                >
                  City
                </Label>
                <Input
                  id="city"
                  value={location.city}
                  onChange={(e) => handleCityChange(e.target.value)}
                  className="bg-slate-800/60 border-slate-700/60 text-white h-11"
                  placeholder="e.g., Chicago, Karachi, London"
                />
                {geocodeError && (
                  <p className="mt-2 text-xs text-red-400 flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                      <path
                        fillRule="evenodd"
                        d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                        clipRule="evenodd"
                      />
                    </svg>
                    {geocodeError}
                  </p>
                )}
                {geocoding && !geocodeError && (
                  <p className="mt-2 text-xs text-slate-400 flex items-center gap-1.5">
                    <svg
                      className="w-3.5 h-3.5 animate-spin"
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
                    Verifying coordinates…
                  </p>
                )}
                {!geocoding && !geocodeError && resolvedMessage && (
                  <p className="mt-2 text-xs text-emerald-400 flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                        clipRule="evenodd"
                      />
                    </svg>
                    {resolvedMessage}
                  </p>
                )}
              </div>
 
              {/* Timezone */}
              <div>
                <Label
                  htmlFor="timezone"
                  className="text-white mb-2 block text-sm font-medium"
                >
                  Timezone
                </Label>
                <Input
                  id="timezone"
                  value={location.timezone}
                  onChange={(e) => handleTimezoneChange(e.target.value)}
                  className="bg-slate-800/60 border-slate-700/60 text-white h-11"
                  placeholder="e.g., America/Chicago, Asia/Karachi"
                />
                <p className="mt-2 text-xs text-slate-500">
                  Auto-filled from your location, but you can change it if needed.
                </p>
              </div>
            </div>
          </div>
 
          {/* Mosque Location Toggle */}
          <div className="mb-8 p-5 bg-slate-800/30 rounded-2xl border border-slate-700/60">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="text-white font-medium mb-1">
                  Fine-tune with mosque location
                </div>
                <p className="text-slate-400 text-sm leading-relaxed">
                  After setup, you can select a nearby mosque to use its exact
                  coordinates for even more precise prayer times.
                </p>
              </div>
              <Switch
                checked={location.useMosqueLocation}
                onCheckedChange={(checked: boolean) =>
                  setLocation((prev) => ({ ...prev, useMosqueLocation: checked }))
                }
              />
            </div>
          </div>
 
          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-3">
            <Button
              onClick={() => navigate("/onboarding/step2")}
              variant="outline"
              className="flex-1 border-slate-700 text-slate-300 hover:bg-slate-800 h-11 touch-manipulation active:bg-slate-800"
              disabled={geocoding || usingDeviceLocation}
            >
              Back
            </Button>
            <Button
              onClick={handleNext}
              className="flex-1 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white h-11 font-medium touch-manipulation active:opacity-90"
              disabled={geocoding || usingDeviceLocation}
            >
              {geocoding ? "Verifying…" : "Continue to prayer settings"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}