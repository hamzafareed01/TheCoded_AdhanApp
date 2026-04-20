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
  sonos: 'Sonos'
};

export default function Step6Summary({ onboardingData, setOnboardingData }: any) {
  const navigate = useNavigate();
  const [isComplete, setIsComplete] = useState(false);

  const handleConfirm = () => {
    setIsComplete(true);
    setTimeout(() => {
      navigate('/dashboard');
    }, 2500);
  };

  if (isComplete) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center py-8 px-4">
        <div className="max-w-md text-center">
          <div className="w-24 h-24 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-full flex items-center justify-center mx-auto mb-6 shadow-2xl shadow-emerald-500/20">
            <PartyPopper className="w-12 h-12 text-white" />
          </div>
          <h1 className="text-3xl md:text-4xl font-semibold text-white mb-4">
            All set!
          </h1>
          <p className="text-slate-300 text-lg mb-4">
            Smart Adhan automation is now enabled on your devices.
          </p>
          <p className="text-slate-500 text-sm">
            Redirecting to dashboard...
          </p>
        </div>
      </div>
    );
  }

  const selectedPlatforms = onboardingData.selectedPlatforms || [];
  const connectedPlatforms = onboardingData.connectedPlatforms || [];
  const { location, prayerSettings, devices, adhanPreferences } = onboardingData;

  return (
    <div className="min-h-screen bg-slate-950">
      {/* Sticky Header */}
      <div className="sticky top-0 z-20 bg-slate-950/95 backdrop-blur-sm border-b border-slate-800/50">
        <div className="max-w-7xl mx-auto px-4 py-4 md:px-6">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <Logo />
            <ProgressIndicator currentStep={6} totalSteps={6} />
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8 md:py-12">
        {/* Hero Section */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-3">
            <div className="rounded-xl bg-emerald-500/10 p-2.5">
              <PartyPopper className="w-6 h-6 text-emerald-400" />
            </div>
            <h1 className="text-3xl md:text-4xl font-semibold text-white">
              Setup complete
            </h1>
          </div>
          <p className="text-base md:text-lg text-slate-400 leading-relaxed max-w-2xl">
            Review your configuration and confirm to enable Adhan automation across your devices.
          </p>
        </div>

        {/* Main Content Card */}
        <div className="rounded-3xl border border-slate-800/60 bg-slate-900/40 backdrop-blur-sm p-6 md:p-10">
          <div className="space-y-5 mb-8">
            {/* Platforms & Accounts */}
            <div className="p-6 bg-slate-800/30 rounded-2xl border border-slate-700/60">
              <h2 className="text-white font-semibold text-lg mb-4">Platforms & Accounts</h2>
              <div className="space-y-3">
                {selectedPlatforms.map((platform: string) => (
                  <div key={platform} className="flex items-center justify-between py-2">
                    <span className="text-slate-300 font-medium">{platformNames[platform]}</span>
                    {connectedPlatforms.includes(platform) ? (
                      <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30">
                        <CheckCircle className="w-3.5 h-3.5 mr-1.5" />
                        Connected
                      </Badge>
                    ) : (
                      <Badge className="bg-slate-700/40 text-slate-400 border-slate-600/60">
                        <XCircle className="w-3.5 h-3.5 mr-1.5" />
                        Not connected
                      </Badge>
                    )}
                  </div>
                ))}
                {selectedPlatforms.includes('sonos') && (
                  <p className="text-slate-500 text-sm mt-3 pt-3 border-t border-slate-700/60">
                    Sonos: Using {connectedPlatforms.includes('alexa') ? 'Alexa' : 'Google'} connection
                  </p>
                )}
              </div>
            </div>

            {/* Location & Timezone */}
            <div className="p-6 bg-slate-800/30 rounded-2xl border border-slate-700/60">
              <h2 className="text-white font-semibold text-lg mb-4">Location & Timezone</h2>
              <div className="space-y-2.5">
                <div className="flex items-center justify-between py-1">
                  <span className="text-slate-500 text-sm">Country</span>
                  <span className="text-white font-medium">{location?.country?.toUpperCase() || 'Not set'}</span>
                </div>
                <div className="flex items-center justify-between py-1">
                  <span className="text-slate-500 text-sm">City</span>
                  <span className="text-white font-medium">{location?.city || 'Not set'}</span>
                </div>
                <div className="flex items-center justify-between py-1">
                  <span className="text-slate-500 text-sm">Timezone</span>
                  <span className="text-white font-medium">{location?.timezone || 'Not set'}</span>
                </div>
              </div>
            </div>

            {/* Prayer Settings */}
            <div className="p-6 bg-slate-800/30 rounded-2xl border border-slate-700/60">
              <h2 className="text-white font-semibold text-lg mb-4">Prayer Settings</h2>
              <div className="space-y-2.5">
                <div className="flex items-center justify-between py-1">
                  <span className="text-slate-500 text-sm">Method</span>
                  <span className="text-white font-medium">{prayerSettings?.calculationMethod?.toUpperCase() || 'ISNA'}</span>
                </div>
                <div className="flex items-center justify-between py-1">
                  <span className="text-slate-500 text-sm">Asr Method</span>
                  <span className="text-white font-medium">{prayerSettings?.asrMethod === 'hanafi' ? 'Hanafi' : 'Standard'}</span>
                </div>
                <div className="flex items-center justify-between py-1">
                  <span className="text-slate-500 text-sm">High-latitude</span>
                  <span className="text-white font-medium">{prayerSettings?.highLatitudeMode || 'Automatic'}</span>
                </div>
              </div>
            </div>

            {/* Devices & Adhan */}
            <div className="p-6 bg-slate-800/30 rounded-2xl border border-slate-700/60">
              <h2 className="text-white font-semibold text-lg mb-4">Devices & Adhan</h2>
              <div className="space-y-2.5">
                <div className="flex items-center justify-between py-1">
                  <span className="text-slate-500 text-sm">Devices</span>
                  <span className="text-white font-medium">{devices?.length || 0} selected</span>
                </div>
                <div className="flex items-center justify-between py-1">
                  <span className="text-slate-500 text-sm">Reciter</span>
                  <span className="text-white font-medium">{adhanPreferences?.reciter || 'Madinah'}</span>
                </div>
                {adhanPreferences?.quietHoursEnabled && (
                  <div className="flex items-center justify-between py-1">
                    <span className="text-slate-500 text-sm">Quiet Hours</span>
                    <span className="text-white font-medium">
                      {adhanPreferences?.quietHours?.from} – {adhanPreferences?.quietHours?.to}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-3">
            <Button 
              onClick={() => navigate('/onboarding/step5')}
              variant="outline"
              className="flex-1 border-slate-700 text-slate-300 hover:bg-slate-800 h-11"
            >
              Back
            </Button>
            <Button 
              onClick={handleConfirm}
              className="flex-1 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white h-11 font-medium"
            >
              Confirm & Enable Adhan
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}