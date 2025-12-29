import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Logo } from '../shared/Logo';
import { ProgressIndicator } from '../shared/ProgressIndicator';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { CheckCircle, Settings } from 'lucide-react';
import {
  AlexaIcon,
  GoogleIcon,
  AppleIcon,
  SamsungIcon,
  SonosIcon,
} from '../shared/BrandIcons';
import { ensureAmazonSdk } from '../../lib/amazonLogin';

const platformIconMap: any = {
  alexa: AlexaIcon,
  google: GoogleIcon,
  apple: AppleIcon,
  samsung: SamsungIcon,
  sonos: SonosIcon,
};

const platformDetails: any = {
  alexa: { name: 'Amazon Alexa', buttonText: 'Connect Amazon' },
  google: { name: 'Google Assistant', buttonText: 'Connect Google' },
  apple: { name: 'Apple Home', buttonText: 'Show HomeKit setup code' },
  samsung: { name: 'Samsung SmartThings', buttonText: 'Connect SmartThings' },
  sonos: {
    name: 'Sonos',
    buttonText: 'Connected via Alexa/Google',
    helper: 'Sonos will use your Alexa or Google connection',
  },
};

export default function Step2ConnectAccounts({ onboardingData, setOnboardingData }: any) {
  const navigate = useNavigate();

  const [connectedPlatforms, setConnectedPlatforms] = useState<string[]>(
    onboardingData.connectedPlatforms || []
  );
  const [connecting, setConnecting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedPlatforms = onboardingData.selectedPlatforms || [];
  useEffect(() => {
    async function syncFromBackend() {
      try {
        const res = await fetch('http://localhost:4000/api/integrations');
        if (!res.ok) return;

        const data = await res.json();

        const initial: string[] = [];
        if (data.alexa?.connected) initial.push('alexa');
        if (data.google?.connected) initial.push('google');
        if (data.apple?.connected) initial.push('apple');
        // you can extend this later for samsung/sonos when they’re real

        if (initial.length) {
          setConnectedPlatforms((prev) => {
            const merged = new Set([...prev, ...initial]);
            return Array.from(merged);
          });
        }
      } catch (err) {
        console.warn('Failed to load integration status from backend', err);
      }
    }

    syncFromBackend();
  }, []);

  const markConnected = (platformId: string) => {
    setConnectedPlatforms((prev) =>
      prev.includes(platformId) ? prev : [...prev, platformId]
    );

    // Phase 0: tell the backend that Alexa is linked
    if (platformId === 'alexa') {
      fetch('http://localhost:4000/api/integrations/alexa/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // In Phase 0 we don’t really validate this on the backend;
          // it just flips the "connected" flag.
          accessToken: 'demo-front-only',
          profile: null,
        }),
      }).catch((err) => {
        console.warn('Could not update Alexa integration status on backend', err);
      });
    }
  };


  const handleConnect = async (platformId: string) => {
    setError(null);

    // Real Login with Amazon flow for Alexa
    if (platformId === 'alexa') {
      try {
        setConnecting('alexa');

        // 1) Load SDK + set clientId
        await ensureAmazonSdk();

        const amazon = (window as any).amazon;
        if (!amazon || !amazon.Login) {
          throw new Error('Amazon SDK not available');
        }

        // 2) Use simple popup implicit flow (access_token directly)
        const options: any = {
          scope: 'profile',
          popup: true, // keep user on our page, open Amazon in popup
        };

        amazon.Login.authorize(options, function (response: any) {
          // This callback runs AFTER the popup closes
          setConnecting(null);

          if (response.error) {
            console.error('Amazon auth error:', response.error);
            setError('Could not connect your Amazon account. Please try again.');
            return;
          }

          const accessToken = response.access_token;
          if (!accessToken) {
            setError('No access token returned from Amazon.');
            return;
          }

          // 3) Optional: fetch profile so we know which account is linked
          amazon.Login.retrieveProfile(
            accessToken,
            async function (profileResponse: any) {
              if (!profileResponse.success) {
                console.warn('Profile lookup error:', profileResponse.error);
              }

              const profile = profileResponse.profile;

              // 4) Tell our backend (non-blocking for Phase 0)
              try {
                await fetch('http://localhost:4000/api/integrations/alexa/login', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    accessToken,
                    profile,
                  }),
                });
              } catch (e) {
                console.warn('Backend /alexa/login failed (Phase 0 demo only):', e);
              }

              // 5) Mark Alexa as connected in onboarding state
              markConnected('alexa');
            }
          );
        });
      } catch (err) {
        console.error(err);
        setConnecting(null);
        setError('Could not start Login with Amazon. Check console for details.');
      }

      return;
    }


    // For other platforms we still just mock “connected” for Phase 0
    markConnected(platformId);
  };

  const handleNext = () => {
    setOnboardingData({ ...onboardingData, connectedPlatforms });
    navigate('/onboarding/step3');
  };

  return (
    <div className="min-h-screen bg-slate-950 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <Logo className="mb-8" />

        <ProgressIndicator currentStep={2} totalSteps={6} />

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 md:p-12">
          <h1 className="text-white mb-4">Connect your accounts</h1>
          <p className="text-slate-300 mb-4">
            Connect your smart home accounts so we can discover your devices and schedule
            Adhan safely.
          </p>

          {error && (
            <div className="mb-4 text-sm text-red-400 bg-red-950/40 border border-red-900 rounded-md px-3 py-2">
              {error}
            </div>
          )}

          <div className="space-y-4 mb-8">
            {selectedPlatforms.map((platformId: string) => {
              const platform = platformDetails[platformId];
              const isConnected = connectedPlatforms.includes(platformId);
              const IconComponent = platformIconMap[platformId];
              const isBusy = connecting === platformId;

              return (
                <div
                  key={platformId}
                  className="p-6 bg-slate-800/50 border border-slate-700 rounded-xl"
                >
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-3">
                      <IconComponent className="w-12 h-12" />
                      <div>
                        <div className="text-white mb-1">{platform.name}</div>
                        {isConnected ? (
                          <div className="flex items-center gap-2">
                            <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
                              <CheckCircle className="w-3 h-3 mr-1" />
                              Connected
                            </Badge>
                          </div>
                        ) : (
                          <div className="text-slate-400 text-sm">
                            {isBusy ? 'Waiting for Amazon…' : 'Not connected'}
                          </div>
                        )}
                        {platform.helper && (
                          <div className="text-slate-500 text-sm mt-1">
                            {platform.helper}
                          </div>
                        )}
                      </div>
                    </div>

                    <div>
                      {isConnected ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="border-slate-600 text-slate-300 hover:bg-slate-700"
                        >
                          <Settings className="w-4 h-4 mr-2" />
                          Manage
                        </Button>
                      ) : (
                        <Button
                          onClick={() => handleConnect(platformId)}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white"
                          size="sm"
                          disabled={isBusy || platformId === 'sonos'}
                        >
                          {isBusy ? 'Connecting…' : platform.buttonText}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex gap-4">
            <Button
              onClick={() => navigate('/onboarding/step1')}
              variant="outline"
              className="flex-1 border-slate-700 text-slate-300 hover:bg-slate-800"
              size="lg"
            >
              Back
            </Button>
            <Button
              onClick={handleNext}
              disabled={connectedPlatforms.length === 0}
              className="flex-1 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white"
              size="lg"
            >
              Next
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

