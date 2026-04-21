import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Logo } from "../shared/Logo";
import { ProgressIndicator } from "../shared/ProgressIndicator";
import { Button } from "../ui/button";
import { Label } from "../ui/label";
import { Input } from "../ui/input";
import { Switch } from "../ui/switch";
import { apiFetch } from "../../lib/api";
import { LocateFixed, MapPin, Clock3, Globe2 } from "lucide-react";

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

function normalizeCity(value: string) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function normalizeCountry(value: string) {
  return String(value || "").trim().replace(/\s+/g, " ");
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

const GEOLOCATION_HIGH_ACCURACY_TIMEOUT_MS = 25000;
const GEOLOCATION_FALLBACK_TIMEOUT_MS = 15000;
const GEOLOCATION_MAX_CACHED_AGE_MS = 5 * 60 * 1000;
const GEOLOCATION_APPROXIMATE_ACCURACY_METERS = 1000;

function describeGeoError(error: unknown) {
  if (error && typeof error === "object" && "code" in error) {
    const code = Number((error as GeolocationPositionError).code);
    if (code === 1) return "Location permission was denied. Please allow location access or enter your city manually.";
    if (code === 2) return "Your device could not determine a location right now. Try again near a window or enter your city manually.";
    if (code === 3) return "Location took too long to respond. We will try a faster fallback, or you can enter your city manually.";
  }

  if (error instanceof Error && error.message.trim()) return error.message;
  return "Could not access your device location.";
}

function getCurrentPositionAsync(options: PositionOptions) {
  return new Promise<GeolocationPosition>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, options);
  });
}

function getGlobalTimezones() {
  try {
    const values = (Intl as typeof Intl & {
      supportedValuesOf?: (key: string) => string[];
    }).supportedValuesOf?.("timeZone");

    if (Array.isArray(values) && values.length > 0) {
      return values;
    }
  } catch {
    // ignore and use fallback
  }

  return [
    "UTC",
    "Africa/Cairo",
    "Africa/Johannesburg",
    "America/Chicago",
    "America/Los_Angeles",
    "America/New_York",
    "America/Toronto",
    "Asia/Dhaka",
    "Asia/Dubai",
    "Asia/Karachi",
    "Asia/Kolkata",
    "Asia/Kuala_Lumpur",
    "Asia/Riyadh",
    "Asia/Singapore",
    "Asia/Tokyo",
    "Australia/Sydney",
    "Europe/Berlin",
    "Europe/Istanbul",
    "Europe/London",
    "Europe/Paris",
    "Pacific/Auckland",
  ];
}

export default function Step3Location({
  onboardingData,
  setOnboardingData,
}: Step3LocationProps) {
  const navigate = useNavigate();

  const initialCountry = normalizeCountry(onboardingData?.location?.country || "");
  const initialCity = normalizeCity(onboardingData?.location?.city || "");
  const initialTimezone = normalizeTimezone(onboardingData?.location?.timezone || "");
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

  const [timezoneManuallyEdited, setTimezoneManuallyEdited] = useState(Boolean(initialTimezone));
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

  const timezoneOptions = useMemo(() => getGlobalTimezones(), []);

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
    const nextCountry = normalizeCountry(value);

    setLocation((prev) => ({
      ...prev,
      country: nextCountry,
      timezone: nextCountry ? prev.timezone : "",
    }));

    if (!nextCountry) {
      setLocation((prev) => ({
        ...prev,
        country: "",
        timezone: "",
      }));
    }

    if (resolvedKey) clearResolvedCoordinates();
    setTimezoneManuallyEdited(false);
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
      setGeocodeError("Please enter a country.");
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

  const reverseGeocodeCoordinates = async (lat: number, lng: number) => {
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

    return {
      lat: typeof data?.lat === "number" ? data.lat : lat,
      lng: typeof data?.lng === "number" ? data.lng : lng,
      city: normalizeCity(String(data?.city || data?.query || location.city || "")),
      country: normalizeCountry(String(data?.countryCode || data?.country || location.country || "")),
      timezone: normalizeTimezone(String(data?.timezone || getBrowserTimezone())),
      formatted:
        typeof data?.formatted === "string" && data.formatted.trim()
          ? data.formatted.trim()
          : null,
    };
  };

  const handleUseDeviceLocation = async () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGeocodeError("Device location is not available in this browser.");
      return;
    }

    setUsingDeviceLocation(true);
    setGeocodeError(null);
    setResolvedMessage(null);

    let position: GeolocationPosition | null = null;
    let fallbackUsed = false;

    try {
      try {
        position = await getCurrentPositionAsync({
          enableHighAccuracy: true,
          timeout: GEOLOCATION_HIGH_ACCURACY_TIMEOUT_MS,
          maximumAge: GEOLOCATION_MAX_CACHED_AGE_MS,
        });
      } catch (highAccuracyError) {
        console.warn("High-accuracy geolocation failed, retrying with fallback", highAccuracyError);
        fallbackUsed = true;
        position = await getCurrentPositionAsync({
          enableHighAccuracy: false,
          timeout: GEOLOCATION_FALLBACK_TIMEOUT_MS,
          maximumAge: GEOLOCATION_MAX_CACHED_AGE_MS * 2,
        });
      }

      const lat = position.coords.latitude;
      const lng = position.coords.longitude;
      const accuracy =
        typeof position.coords.accuracy === "number" && Number.isFinite(position.coords.accuracy)
          ? Math.round(position.coords.accuracy)
          : null;

      const resolved = await reverseGeocodeCoordinates(lat, lng);
      const reverseCity = resolved.city;
      const reverseCountry = resolved.country;
      const reverseTimezone = resolved.timezone;
      const effectiveLookupKey = makeResolvedKey(reverseCountry, reverseCity || location.city);

      setLocation((prev) => ({
        ...prev,
        city: reverseCity || prev.city,
        country: reverseCountry || prev.country,
        timezone: reverseTimezone || prev.timezone,
        latitude: resolved.lat,
        longitude: resolved.lng,
      }));
      setTimezoneManuallyEdited(false);
      setResolvedKey(effectiveLookupKey);

      const statusParts = ["Device location ready"];
      if (resolved.formatted) statusParts.push(resolved.formatted);
      if (accuracy != null) {
        statusParts.push(
          accuracy > GEOLOCATION_APPROXIMATE_ACCURACY_METERS
            ? `approximate (${accuracy}m accuracy)`
            : `${accuracy}m accuracy`
        );
      }
      if (fallbackUsed) statusParts.push("fallback mode used");
      statusParts.push(`${resolved.lat.toFixed(5)}, ${resolved.lng.toFixed(5)}`);

      setResolvedMessage(statusParts.join(" · "));

      if (accuracy != null && accuracy > GEOLOCATION_APPROXIMATE_ACCURACY_METERS) {
        setGeocodeError(
          `Your device returned an approximate location (${accuracy}m accuracy). Review the city and timezone below before continuing.`
        );
      }
    } catch (err) {
      console.error(err);
      setGeocodeError(describeGeoError(err));
    } finally {
      setUsingDeviceLocation(false);
    }
  };

  const handleNext = async () => {
    const cityTrimmed = normalizeCity(location.city);
    const countryTrimmed = normalizeCountry(location.country);
    const timezoneTrimmed = normalizeTimezone(location.timezone);

    if (!countryTrimmed) {
      setGeocodeError("Please enter a country.");
      return;
    }

    if (!cityTrimmed) {
      setGeocodeError("Please enter a city.");
      return;
    }

    if (!timezoneTrimmed) {
      setGeocodeError("Please select a timezone.");
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
        `Coordinates confirmed for ${result.formatted}: ${result.lat.toFixed(
          5
        )}, ${result.lng.toFixed(5)}${
          result.geocodedTimezone ? ` · Timezone: ${result.geocodedTimezone}` : ""
        }`
      );
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
    <div className="min-h-screen bg-slate-950">
      <div className="sticky top-0 z-20 bg-slate-950/95 backdrop-blur-sm border-b border-slate-800/50">
        <div className="max-w-7xl mx-auto px-4 py-4 md:px-6">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <Logo />
            <ProgressIndicator currentStep={3} totalSteps={6} />
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8 md:py-12">
        <div className="mb-8 md:mb-10">
          <h1 className="text-3xl md:text-4xl font-semibold text-white mb-3">
            Set your location
          </h1>
          <p className="text-base md:text-lg text-slate-400 leading-relaxed max-w-2xl">
            Your location helps us calculate precise prayer times based on the
            position of the sun in your area.
          </p>
        </div>

        <div className="rounded-3xl border border-slate-800/60 bg-slate-900/40 backdrop-blur-sm p-6 md:p-10">
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
                  className="w-full sm:w-auto bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white h-11"
                >
                  <LocateFixed className="w-4 h-4 mr-2" />
                  {usingDeviceLocation ? "Getting location…" : "Use my location"}
                </Button>
                {resolvedMessage && !usingDeviceLocation && (
                  <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-300">
                    {resolvedMessage}
                  </div>
                )}
                {geocodeError && !usingDeviceLocation && (
                  <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-300">
                    {geocodeError}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="mb-8">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-px flex-1 bg-slate-700/50" />
              <span className="text-slate-500 text-sm">Or enter manually</span>
              <div className="h-px flex-1 bg-slate-700/50" />
            </div>

            <div className="space-y-5">
              <div>
                <Label
                  htmlFor="country"
                  className="text-white mb-2 block text-sm font-medium"
                >
                  Country or region
                </Label>
                <div className="relative">
                  <Globe2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <Input
                    id="country"
                    value={location.country}
                    onChange={(e) => handleCountryChange(e.target.value)}
                    className="pl-10 bg-slate-800/60 border-slate-700/60 text-white h-11"
                    placeholder="Type any country, e.g. United States, India, Saudi Arabia"
                  />
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  You can enter any country globally. Timezone becomes available after this field is filled.
                </p>
              </div>

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
                {geocoding && !geocodeError && (
                  <p className="mt-2 text-xs text-slate-400 flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
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
              </div>

              <div>
                <Label
                  htmlFor="timezone"
                  className="text-white mb-2 block text-sm font-medium"
                >
                  Timezone
                </Label>
                <Input
                  id="timezone"
                  list="timezone-options"
                  value={location.timezone}
                  onChange={(e) => handleTimezoneChange(e.target.value)}
                  disabled={!location.country}
                  className="bg-slate-800/60 border-slate-700/60 text-white h-11 disabled:opacity-50"
                  placeholder={location.country ? "Select or search timezone" : "Enter country first"}
                />
                <datalist id="timezone-options">
                  {timezoneOptions.map((timezone) => (
                    <option key={timezone} value={timezone} />
                  ))}
                </datalist>

                <div className="mt-2 flex items-start gap-2 text-xs text-slate-500">
                  <Clock3 className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                  <p>
                    {location.country
                      ? `Timezone selection is now enabled for ${location.country}. We will also verify it when we geocode ${location.city || "your city"}.`
                      : "Choose a country first, then select the correct timezone for your city."}
                  </p>
                </div>
              </div>
            </div>
          </div>

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
                  setLocation((prev) => ({
                    ...prev,
                    useMosqueLocation: checked,
                  }))
                }
              />
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <Button
              onClick={() => navigate("/onboarding/step2")}
              variant="outline"
              className="flex-1 border-slate-700 text-slate-300 hover:bg-slate-800 h-11"
              disabled={geocoding || usingDeviceLocation}
            >
              Back
            </Button>
            <Button
              onClick={handleNext}
              className="flex-1 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white h-11 font-medium"
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