import React, { useEffect, useMemo, useState, ChangeEvent } from 'react';
import { Logo } from '../shared/Logo';
import { Navigation } from '../shared/Navigation';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { ScrollArea } from '../ui/scroll-area';
import { Label } from '../ui/label';
import { apiFetch } from "../../lib/api";
import { MapPin, Search, CheckCircle2, Navigation2 } from 'lucide-react';

type QuietHours = {
  enabled: boolean;
  from: string;
  to: string;
  muteFajr: boolean;
};

type UserSettings = {
  userId: string;
  language: string;
  madhhab: string;
  shia: boolean;
  calculationMethod: string;
  highLatitudeMethod: string;
  country: 'US' | 'PK' | string;
  city: string;
  timezone: string;
  mosqueId: string | null;
  quietHours: QuietHours;
  latitude?: number;
  longitude?: number;

  mosqueName?: string | null;
  mosqueAddress?: string | null;
  mosqueLat?: number | null;
  mosqueLng?: number | null;
};

type Mosque = {
  placeId: string;
  name: string;
  address?: string;
  location?: {
    lat?: number;
    lng?: number;
  };
};

type MosqueSelectorProps = {
  onboardingData: any;
  setOnboardingData: (data: any) => void;
};

function norm(s?: string) {
  return (s ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/,+/g, ',')
    .replace(/,\s+/g, ', ');
}

function isSameLocationQuery(query: string, settings: UserSettings) {
  const q = norm(query);
  const city = norm(settings.city);

  // Empty query => treat as "use my onboarding location"
  if (!q) return true;

  // Exact city match or "city, ..." match
  if (q === city) return true;
  if (q.startsWith(`${city},`)) return true;

  return false;
}

export default function MosqueSelector({
  onboardingData,
  setOnboardingData,
}: MosqueSelectorProps) {
  const [settings, setSettings] = useState<UserSettings | null>(null);

  const [mosques, setMosques] = useState<Mosque[]>([]);
  const [mosquesLoading, setMosquesLoading] = useState(false);
  const [mosquesError, setMosquesError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMosqueId, setSelectedMosqueId] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onboardingCityLabel = useMemo(() => {
    if (!settings) return '';
    return `${settings.city}, ${settings.country}`;
  }, [settings]);
  //Helper function
  const openDirections = (mosque: Mosque) => {
    const origin =
      settings?.latitude && settings?.longitude
        ? `${settings.latitude},${settings.longitude}`
        : '';

    const destination = mosque.placeId
      ? `place_id:${mosque.placeId}`
      : mosque.address
        ? encodeURIComponent(mosque.address)
        : encodeURIComponent(mosque.name);

    // If we have user coords, include origin. Otherwise just open destination.
    const url = origin
      ? `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(
        origin
      )}&destination=${encodeURIComponent(destination)}&travelmode=driving`
      : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
        destination
      )}&travelmode=driving`;

    window.open(url, '_blank', 'noopener,noreferrer');
  };


  // end






  const handleSearchInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  };

  const fetchMosques = async (queryOverride?: string) => {
    if (!settings) return;

    const rawQuery =
      queryOverride?.trim() ??
      searchQuery.trim() ??
      settings.city?.trim() ??
      '';

    const sameAsOnboarding = isSameLocationQuery(rawQuery, settings);

    try {
      setMosquesLoading(true);
      setMosquesError(null);

      // If user didn’t type anything, default to onboarding city
      const effectiveQuery = rawQuery || settings.city;

      const params = new URLSearchParams();
      params.set("query", effectiveQuery);
      params.set("country", settings.country || "US");
      params.set("radiusKm", "25");

      if (
        sameAsOnboarding &&
        typeof settings.latitude === "number" &&
        typeof settings.longitude === "number"
      ) {
        // Bias search around the user's onboarding location
        params.set("bias", "user");
      } else {
        // No bias if user is searching a different city/zip/etc.
        params.set("bias", "none");
      }

      const res = await apiFetch(`/api/mosques?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to load mosques');

      const json = await res.json();

      const places: Mosque[] = (json.mosques || []).map((m: any) => ({
        placeId: m.placeId,
        name: m.name,
        address: m.address,
        location: m.location,
      }));

      setMosques(places);
    } catch (err) {
      console.error(err);
      setMosquesError('Unable to load mosques from server.');
      setMosques([]);
    } finally {
      setMosquesLoading(false);
    }
  };

  // Load user settings once
  useEffect(() => {
    const load = async () => {
      try {
        const res = await apiFetch(`/api/user/settings`);
        if (!res.ok) throw new Error('Failed to load settings');
        const json: UserSettings = await res.json();
        setSettings(json);
        setSelectedMosqueId(json.mosqueId || null);

        // Optional: show nearby mosques immediately on load
        // await fetchMosques(json.city);
      } catch (err) {
        console.error(err);
        setError('Unable to load settings from server.');
      }
    };

    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSearchClick = async () => {
    await fetchMosques(searchQuery);
  };

  const handleSave = async () => {
    if (!selectedMosqueId) {
      setError('Please select a mosque first.');
      setSaveMessage(null);
      return;
    }
    if (!settings) return;

    try {
      setSaving(true);
      setError(null);
      setSaveMessage(null);

      const selectedMosque = mosques.find((m) => m.placeId === selectedMosqueId);

      // IMPORTANT:
      // - Do NOT overwrite userSettings.latitude/longitude with mosque coords.
      // - Save mosque coords separately.
      const payload: any = {
        mosqueId: selectedMosqueId,
        mosqueName: selectedMosque?.name,
        mosqueAddress: selectedMosque?.address,
        mosqueLat: selectedMosque?.location?.lat,
        mosqueLng: selectedMosque?.location?.lng,
      };
      const res = await apiFetch(`/api/user/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error('Failed to save mosque selection');

      const json = await res.json();
      const updatedSettings: UserSettings = json.settings;
      setSettings(updatedSettings);

      setOnboardingData({
        ...onboardingData,
        mosque: selectedMosque
          ? {
            id: selectedMosque.placeId,
            name: selectedMosque.name,
            address: selectedMosque.address,
            location: selectedMosque.location ?? null,
          }
          : { id: selectedMosqueId },
      });

      setSaveMessage('Mosque selection saved.');
    } catch (err) {
      console.error(err);
      setError('Could not save mosque. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 py-8 px-4">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
          <Logo />
          <Navigation />
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6">
          <div>
            <h1 className="text-white text-xl mb-1">Choose your mosque</h1>
            <p className="text-slate-400 text-sm">
              We use your mosque&apos;s timetable when available, and fall back to
              calculation for other days.
            </p>
          </div>

          {error && (
            <div className="text-sm text-red-400 bg-red-950/40 border border-red-900 rounded-md px-3 py-2">
              {error}
            </div>
          )}
          {saveMessage && (
            <div className="text-sm text-emerald-400 bg-emerald-950/40 border border-emerald-900 rounded-md px-3 py-2">
              {saveMessage}
            </div>
          )}

          {!settings ? (
            <p className="text-slate-400 text-sm">Loading settings…</p>
          ) : (
            <>
              <div className="space-y-2">
                <Label className="text-slate-200">Search</Label>
                <div className="flex flex-col md:flex-row gap-3">
                  <Input
                    placeholder="Search by city (Chicago / Schaumburg) or mosque name…"
                    value={searchQuery}
                    onChange={handleSearchInputChange}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSearchClick();
                    }}
                    className="bg-slate-900 border-slate-700 text-slate-100 md:max-w-md"
                  />
                  <Button
                    onClick={handleSearchClick}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white md:w-auto"
                  >
                    <Search className="w-4 h-4 mr-2" />
                    Search
                  </Button>
                </div>
                <p className="text-xs text-slate-500">
                  Current city: {onboardingCityLabel}
                </p>
              </div>

              <ScrollArea className="h-[480px] mt-4">
                {mosquesLoading && (
                  <p className="text-slate-400 text-sm px-1">Loading mosques…</p>
                )}
                {mosquesError && (
                  <p className="text-red-400 text-sm px-1">{mosquesError}</p>
                )}
                {!mosquesLoading && !mosquesError && mosques.length === 0 && (
                  <p className="text-slate-400 text-sm px-1">
                    No mosques found for this search.
                  </p>
                )}

                <div className="space-y-3 mt-2">
                  {mosques.map((mosque) => {
                    const isSelected = mosque.placeId === selectedMosqueId;

                    return (
                      <div
                        key={mosque.placeId}
                        className={`w-full p-4 rounded-xl border transition-colors flex items-start justify-between gap-4
    ${isSelected
                            ? 'border-emerald-500 bg-emerald-500/10'
                            : 'border-slate-700 bg-slate-800/60 hover:border-slate-500'
                          }`}
                      >
                        {/* Left side clickable area = select mosque */}
                        <button
                          type="button"
                          onClick={() => setSelectedMosqueId(mosque.placeId)}
                          className="flex-1 text-left"
                        >
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="text-white text-sm md:text-base">{mosque.name}</h3>
                            </div>
                            <div className="flex items-center gap-2 text-slate-400 text-xs md:text-sm">
                              <MapPin className="w-3 h-3" />
                              <span>{mosque.address}</span>
                            </div>
                          </div>
                        </button>

                        {/* Right side actions */}
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              openDirections(mosque);
                            }}
                            title="Directions"
                            className="p-2 rounded-lg border border-slate-700 hover:border-slate-500 bg-slate-900 text-slate-200 hover:text-white"
                          >
                            <Navigation2 className="w-4 h-4" />
                          </button>

                          {isSelected && (
                            <div className="flex items-center gap-1 text-emerald-400 text-xs md:text-sm">
                              <CheckCircle2 className="w-4 h-4" />
                              Selected
                            </div>
                          )}
                        </div>
                      </div>

                    );
                  })}
                </div>
              </ScrollArea>

              <div className="flex justify-end pt-4">
                <Button
                  onClick={handleSave}
                  disabled={saving || !selectedMosqueId}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  {saving ? 'Saving…' : 'Save mosque'}
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}