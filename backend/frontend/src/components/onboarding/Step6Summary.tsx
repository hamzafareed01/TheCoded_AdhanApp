import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Logo } from '../shared/Logo';
import { ProgressIndicator } from '../shared/ProgressIndicator';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { CheckCircle, XCircle, PartyPopper } from 'lucide-react';

const platformNames: any = {
  alexa: 'Amazon Alexa',
  google: 'Google Assistant',
  apple: 'Apple Home',
  samsung: 'Samsung SmartThings',
  sonos: 'Sonos',
};

type Step6SummaryProps = {
  onboardingData: any;
  setOnboardingData: (data: any) => void;
};

export default function Step6Summary({
  onboardingData,
}: Step6SummaryProps) {
  const navigate = useNavigate();
  const [isComplete, setIsComplete] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    setSaving(true);
    setError(null);

    // Build payload for /api/user/settings from onboarding data
    const location = onboardingData.location || {};
    const prayerSettings = onboardingData.prayerSettings || {};
    const adhanPreferences = onboardingData.adhanPreferences || {};
    const mosque = onboardingData.mosque || null;

    const quietHoursEnabled = !!adhanPreferences.quietHoursEnabled;
    const quiet = adhanPreferences.quietHours || {};

    const payload = {
      // Location
      country: location.country || 'US',
      city: location.city || 'Chicago',
      timezone: location.timezone || 'America/Chicago',

      // Prayer rules
      calculationMethod: prayerSettings.calculationMethod || 'isna',
      // Asr method maps to madhhab in backend: hanafi vs shafi
      madhhab: prayerSettings.asrMethod === 'hanafi' ? 'hanafi' : 'shafi',
      shia: !!prayerSettings.shia,
      highLatitudeMethod: prayerSettings.highLatitudeMode || 'automatic',

      // Mosque selection (if chosen)
      mosqueId: mosque?.id || null,

      // Quiet hours / Adhan preferences
      quietHours: quietHoursEnabled
        ? {
          enabled: true,
          from: quiet.from || '22:00',
          to: quiet.to || '07:00',
          muteFajr: !!adhanPreferences.muteFajr,
        }
        : {
          enabled: false,
          from: quiet.from || '22:00',
          to: quiet.to || '07:00',
          muteFajr: !!adhanPreferences.muteFajr,
        },
    };

    try {
      const res = await fetch('http://localhost:4000/api/user/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        // Try to get a message but don't crash if body isn't JSON
        let msg = 'Could not save your settings on the server.';
        try {
          const json = await res.json();
          if (json?.error) msg = json.error;
        } catch {
          // ignore
        }
        setError(msg);
      }
    } catch (err) {
      console.error('Failed to save user settings', err);
      setError('Could not reach the backend. We will continue with local settings.');
    } finally {
      setIsComplete(true);
      setSaving(false);
      setTimeout(() => {
        navigate('/dashboard');
      }, 1200);
    }
  };

  if (isComplete) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center py-8 px-4">
        <div className="max-w-md text-center">
          <div className="w-20 h-20 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-full flex items-center justify-center mx-auto mb-6">
            <PartyPopper className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-white mb-4">All set!</h1>
          <p className="text-slate-300 text-lg">
            Smart Adhan automation is now enabled on your devices.
          </p>
          <p className="text-slate-400 mt-4">Redirecting to dashboard...</p>
        </div>
      </div>
    );
  }

  const selectedPlatforms = onboardingData.selectedPlatforms || [];
  const connectedPlatforms = onboardingData.connectedPlatforms || [];
  const { location, prayerSettings, devices, adhanPreferences } = onboardingData;

  return (
    <div className="min-h-screen bg-slate-950 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <Logo className="mb-8" />

        <ProgressIndicator currentStep={6} totalSteps={6} />

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 md:p-12">
          <h1 className="text-white mb-4">Review</h1>
          <p className="text-slate-300 mb-8">
            Review your setup before we enable the Adhan automation.
          </p>

          {error && (
            <div className="mb-4 text-sm text-amber-300 bg-amber-900/20 border border-amber-700 rounded-md px-3 py-2">
              {error}
            </div>
          )}

          <div className="space-y-6 mb-8">
            {/* Platforms & Accounts */}
            <div className="p-6 bg-slate-800/50 rounded-xl border border-slate-700">
              <h2 className="text-white mb-4">Platforms & Accounts</h2>
              <div className="space-y-2">
                {selectedPlatforms.map((platform: string) => (
                  <div key={platform} className="flex items-center justify-between">
                    <span className="text-slate-300">
                      {platformNames[platform]}
                    </span>
                    {connectedPlatforms.includes(platform) ? (
                      <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
                        <CheckCircle className="w-3 h-3 mr-1" />
                        Connected
                      </Badge>
                    ) : (
                      <Badge className="bg-slate-700 text-slate-400 border-slate-600">
                        <XCircle className="w-3 h-3 mr-1" />
                        Not connected
                      </Badge>
                    )}
                  </div>
                ))}
                {selectedPlatforms.includes('sonos') && (
                  <p className="text-slate-500 text-sm mt-2">
                    Sonos: Using{' '}
                    {connectedPlatforms.includes('alexa') ? 'Alexa' : 'Google'} connection
                  </p>
                )}
              </div>
            </div>

            {/* Location & Timezone */}
            <div className="p-6 bg-slate-800/50 rounded-xl border border-slate-700">
              <h2 className="text-white mb-4">Location & Timezone</h2>
              <div className="space-y-1 text-slate-300">
                <p>
                  <span className="text-slate-500">Country:</span>{' '}
                  {location?.country?.toUpperCase() || 'Not set'}
                </p>
                <p>
                  <span className="text-slate-500">City:</span>{' '}
                  {location?.city || 'Not set'}
                </p>
                <p>
                  <span className="text-slate-500">Timezone:</span>{' '}
                  {location?.timezone || 'Not set'}
                </p>
              </div>
            </div>

            {/* Prayer Settings */}
            <div className="p-6 bg-slate-800/50 rounded-xl border border-slate-700">
              <h2 className="text-white mb-4">Prayer Settings</h2>
              <div className="space-y-1 text-slate-300">
                <p>
                  <span className="text-slate-500">Method:</span>{' '}
                  {prayerSettings?.calculationMethod?.toUpperCase() || 'ISNA'}
                </p>
                <p>
                  <span className="text-slate-500">Asr Method:</span>{' '}
                  {prayerSettings?.asrMethod === 'hanafi' ? 'Hanafi' : 'Standard'}
                </p>
                <p>
                  <span className="text-slate-500">High-latitude:</span>{' '}
                  {prayerSettings?.highLatitudeMode || 'Automatic'}
                </p>
              </div>
            </div>

            {/* Devices & Adhan */}
            <div className="p-6 bg-slate-800/50 rounded-xl border border-slate-700">
              <h2 className="text-white mb-4">Devices & Adhan</h2>
              <div className="space-y-3 text-slate-300">
                <p>
                  <span className="text-slate-500">Devices:</span>{' '}
                  {devices?.length || 0} device(s) selected
                </p>
                <p>
                  <span className="text-slate-500">Reciter:</span>{' '}
                  {adhanPreferences?.reciter || 'Madinah'}
                </p>
                {adhanPreferences?.quietHoursEnabled && (
                  <p>
                    <span className="text-slate-500">Quiet Hours:</span>{' '}
                    {adhanPreferences?.quietHours?.from} –{' '}
                    {adhanPreferences?.quietHours?.to}
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="flex gap-4">
            <Button
              onClick={() => navigate('/onboarding/step5')}
              variant="outline"
              className="flex-1 border-slate-700 text-slate-300 hover:bg-slate-800"
              size="lg"
              disabled={saving}
            >
              Back
            </Button>
            <Button
              onClick={handleConfirm}
              className="flex-1 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white"
              size="lg"
              disabled={saving}
            >
              {saving ? 'Saving…' : 'Confirm & Enable Adhan'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
