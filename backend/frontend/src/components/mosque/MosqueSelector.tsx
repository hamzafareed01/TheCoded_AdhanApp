import React, { useEffect, useState, ChangeEvent } from 'react';
import { Logo } from '../shared/Logo';
import { Navigation } from '../shared/Navigation';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { ScrollArea } from '../ui/scroll-area';
import { Label } from '../ui/label';
import { MapPin, Search, CheckCircle2 } from 'lucide-react';

const API_BASE =
  (import.meta as any).env?.VITE_API_BASE ?? 'http://localhost:4000';

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
  country: string;
  city: string;
  timezone: string;
  mosqueId: string;
  quietHours: QuietHours;
  latitude?: number;
  longitude?: number;
};

/**
 * Shape of mosques returned by /api/mosques/search (Google Places)
 */
type Mosque = {
  id?: string; // not really used for Places results
  placeId: string;
  name: string;
  city?: string;
  address?: string;
  madhhab?: string;
  hasRamadanTimetable?: boolean;
  location?: {
    lat?: number;
    lng?: number;
  };
};

type MosqueSelectorProps = {
  onboardingData: any;
  setOnboardingData: (data: any) => void;
};

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

  const handleSearchInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  };

  /**
   * Fetch mosques from backend Google Places proxy:
   *   GET /api/mosques/search?q=<query>
   */
  const fetchMosques = async (queryOverride?: string) => {
    try {
      setMosquesLoading(true);
      setMosquesError(null);

      const baseQuery =
        queryOverride?.trim() ||
        searchQuery.trim() ||
        settings?.city ||
        '';

      if (!baseQuery) {
        setMosques([]);
        setMosquesLoading(false);
        return;
      }

      const url = `${API_BASE}/api/mosques/search?q=${encodeURIComponent(
        baseQuery,
      )}`;

      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to load mosques');

      const json = await res.json();

      const places: Mosque[] = (json.mosques || []).map((m: any) => ({
        placeId: m.placeId,
        name: m.name,
        address: m.address,
        city: m.address,
        location: m.location,
      }));

      setMosques(places);
    } catch (err) {
      console.error(err);
      setMosquesError('Unable to load mosques from server.');
    } finally {
      setMosquesLoading(false);
    }
  };

  // Load user settings once (for city display + existing mosqueId)
  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/user/settings`);
        if (!res.ok) throw new Error('Failed to load settings');
        const json: UserSettings = await res.json();
        setSettings(json);
        setSelectedMosqueId(json.mosqueId || null);
      } catch (err) {
        console.error(err);
        setError('Unable to load settings from server.');
      }
    };

    load();
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

      const selectedMosque = mosques.find(
        (m) => m.placeId === selectedMosqueId,
      );

      const payload: any = { mosqueId: selectedMosqueId };

      if (selectedMosque?.location) {
        payload.latitude = selectedMosque.location.lat;
        payload.longitude = selectedMosque.location.lng;
      }

      const res = await fetch(`${API_BASE}/api/user/settings`, {
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
              city: selectedMosque.address,
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
              We use your mosque&apos;s timetable when available, and fall back
              to calculation for other days.
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
              {/* Search bar */}
              <div className="space-y-2">
                <Label className="text-slate-200">Search</Label>
                <div className="flex flex-col md:flex-row gap-3">
                  <Input
                    placeholder="Search by mosque name or city…"
                    value={searchQuery}
                    onChange={handleSearchInputChange}
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
                  Current city: {settings.city}, {settings.country}
                </p>
              </div>

              {/* Mosque list */}
              <ScrollArea className="h-[480px] mt-4">
                {mosquesLoading && (
                  <p className="text-slate-400 text-sm px-1">
                    Loading mosques…
                  </p>
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
                      <button
                        key={mosque.placeId}
                        type="button"
                        onClick={() => setSelectedMosqueId(mosque.placeId)}
                        className={`w-full text-left p-4 rounded-xl border transition-colors flex items-start justify-between gap-4
                          ${
                            isSelected
                              ? 'border-emerald-500 bg-emerald-500/10'
                              : 'border-slate-700 bg-slate-800/60 hover:border-slate-500'
                          }`}
                      >
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="text-white text-sm md:text-base">
                              {mosque.name}
                            </h3>
                          </div>
                          <div className="flex items-center gap-2 text-slate-400 text-xs md:text-sm">
                            <MapPin className="w-3 h-3" />
                            <span>{mosque.address}</span>
                          </div>
                        </div>

                        {isSelected && (
                          <div className="flex items-center gap-1 text-emerald-400 text-xs md:text-sm">
                            <CheckCircle2 className="w-4 h-4" />
                            Selected
                          </div>
                        )}
                      </button>
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
