import { useEffect, useState } from 'react';
import { Logo } from '../shared/Logo';
import { Navigation } from '../shared/Navigation';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from '../ui/select';
import { Checkbox } from '../ui/checkbox';

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
};

type SettingsProps = {
  onboardingData: any;
  setOnboardingData: (data: any) => void;
};

export default function Settings({
  onboardingData,
  setOnboardingData,
}: SettingsProps) {
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load settings from backend on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const res = await fetch('http://localhost:4000/api/user/settings');
        if (!res.ok) throw new Error('Failed to load settings');
        const json = await res.json();
        setSettings(json);
      } catch (err) {
        console.error(err);
        setError('Unable to load settings from server.');
      }
    };

    loadSettings();
  }, []);

  const updateField = <K extends keyof UserSettings>(
    key: K,
    value: UserSettings[K],
  ) => {
    if (!settings) return;
    setSettings({ ...settings, [key]: value });
  };

  const updateQuietHours = <K extends keyof QuietHours>(
    key: K,
    value: QuietHours[K],
  ) => {
    if (!settings) return;
    setSettings({
      ...settings,
      quietHours: { ...settings.quietHours, [key]: value },
    });
  };

  const handleSave = async () => {
    if (!settings) return;
    try {
      setSaving(true);
      setSaveMessage(null);
      setError(null);

      const res = await fetch('http://localhost:4000/api/user/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });

      if (!res.ok) throw new Error('Failed to save settings');

      const json = await res.json();
      setSettings(json.settings);

      // keep onboarding snapshot roughly in sync
      setOnboardingData({
        ...onboardingData,
        location: {
          ...(onboardingData.location || {}),
          city: settings.city,
          country: settings.country,
          timezone: settings.timezone,
        },
        prayerSettings: {
          ...(onboardingData.prayerSettings || {}),
          madhhab: settings.madhhab,
          shia: settings.shia,
          calculationMethod: settings.calculationMethod,
        },
        mosque: {
          ...(onboardingData.mosque || {}),
          id: settings.mosqueId,
        },
      });

      setSaveMessage('Settings saved.');
    } catch (err) {
      console.error(err);
      setError('Could not save settings. Please try again.');
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

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-8">
          <div>
            <h1 className="text-white text-xl mb-1">Settings</h1>
            <p className="text-slate-400 text-sm">
              Manage prayer calculation, location and quiet hours.
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
              {/* Language & fiqh */}
              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h2 className="text-white text-lg">Language & Fiqh</h2>

                  <div className="space-y-2">
                    <Label className="text-slate-200">Language</Label>
                    <Select
                      value={settings.language}
                      onValueChange={(value: string) =>
                        updateField('language', value)
                      }
                    >
                      <SelectTrigger className="bg-slate-900 border-slate-700 text-slate-100">
                        <SelectValue placeholder="Select language" />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-900 border-slate-700">
                        <SelectItem value="en">English</SelectItem>
                        <SelectItem value="ur">Urdu</SelectItem>
                        <SelectItem value="ar">Arabic</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-slate-200">Madhhab</Label>
                    <Select
                      value={settings.madhhab}
                      onValueChange={(value: string) =>
                        updateField('madhhab', value)
                      }
                    >
                      <SelectTrigger className="bg-slate-900 border-slate-700 text-slate-100">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-900 border-slate-700">
                        <SelectItem value="hanafi">Hanafi</SelectItem>
                        <SelectItem value="shafi">Shafi</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center justify-between rounded-lg border border-slate-700 px-4 py-3">
                    <div>
                      <Label className="text-slate-200">Use Shia timings</Label>
                      <p className="text-xs text-slate-400">
                        Switch to Jafari (Shia) calculation rules.
                      </p>
                    </div>
                    <Switch
                      checked={settings.shia}
                      onCheckedChange={(checked: boolean) =>
                        updateField('shia', checked)
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-slate-200">Calculation method</Label>
                    <Select
                      value={settings.calculationMethod}
                      onValueChange={(value: string) =>
                        updateField('calculationMethod', value)
                      }
                    >
                      <SelectTrigger className="bg-slate-900 border-slate-700 text-slate-100">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-900 border-slate-700">
                        <SelectItem value="isna">
                          ISNA (North America)
                        </SelectItem>
                        <SelectItem value="mwl">
                          Muslim World League
                        </SelectItem>
                        <SelectItem value="egypt">
                          Egyptian Authority
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Location */}
                <div className="space-y-4">
                  <h2 className="text-white text-lg">Location</h2>

                  <div className="space-y-2">
                    <Label className="text-slate-200">City</Label>
                    <Input
                      className="bg-slate-900 border-slate-700 text-slate-100"
                      value={settings.city}
                      onChange={(e) => updateField('city', e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-slate-200">Country</Label>
                    <Input
                      className="bg-slate-900 border-slate-700 text-slate-100"
                      value={settings.country}
                      onChange={(e) => updateField('country', e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-slate-200">Time zone</Label>
                    <Input
                      className="bg-slate-900 border-slate-700 text-slate-100"
                      value={settings.timezone}
                      onChange={(e) => updateField('timezone', e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-slate-200">Mosque ID (demo)</Label>
                    <Input
                      className="bg-slate-900 border-slate-700 text-slate-100"
                      value={settings.mosqueId}
                      onChange={(e) => updateField('mosqueId', e.target.value)}
                    />
                    <p className="text-xs text-slate-500">
                      In a real app this would be selected from the Mosque page.
                    </p>
                  </div>
                </div>
              </div>

              {/* Quiet hours */}
              <div className="border-t border-slate-800 pt-6">
                <h2 className="text-white text-lg mb-4">Quiet hours</h2>

                <div className="flex items-center justify-between rounded-lg border border-slate-700 px-4 py-3 mb-4">
                  <div>
                    <Label className="text-slate-200">Enable quiet hours</Label>
                    <p className="text-xs text-slate-400">
                      Automatically mute Adhan during certain times.
                    </p>
                  </div>
                  <Switch
                    checked={settings.quietHours.enabled}
                    onCheckedChange={(checked: boolean) =>
                      updateQuietHours('enabled', checked)
                    }
                  />
                </div>

                {settings.quietHours.enabled && (
                  <div className="grid md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label className="text-slate-200">From</Label>
                      <Input
                        type="time"
                        className="bg-slate-900 border-slate-700 text-slate-100"
                        value={settings.quietHours.from}
                        onChange={(e) =>
                          updateQuietHours('from', e.target.value)
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-slate-200">To</Label>
                      <Input
                        type="time"
                        className="bg-slate-900 border-slate-700 text-slate-100"
                        value={settings.quietHours.to}
                        onChange={(e) =>
                          updateQuietHours('to', e.target.value)
                        }
                      />
                    </div>
                    <div className="flex items-center gap-2 mt-6">
                      <Checkbox
                        id="mute-fajr"
                        checked={settings.quietHours.muteFajr}
                        onCheckedChange={(checked: boolean | 'indeterminate') =>
                          updateQuietHours('muteFajr', checked === true)
                        }
                      />
                      <Label
                        htmlFor="mute-fajr"
                        className="text-slate-200 text-sm"
                      >
                        Always mute Fajr Adhan
                      </Label>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-end pt-4">
                <Button
                  onClick={handleSave}
                  disabled={saving}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  {saving ? 'Saving…' : 'Save settings'}
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
