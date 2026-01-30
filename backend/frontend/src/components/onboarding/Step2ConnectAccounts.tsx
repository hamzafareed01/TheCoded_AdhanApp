import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Logo } from '../shared/Logo';
import { ProgressIndicator } from '../shared/ProgressIndicator';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { CheckCircle } from 'lucide-react';
import {
  AlexaIcon,
  GoogleIcon,
  AppleIcon,
  SamsungIcon,
  SonosIcon,
} from '../shared/BrandIcons';
import { apiFetch } from '../../lib/api';

const platformIconMap: any = {
  alexa: AlexaIcon,
  google: GoogleIcon,
  apple: AppleIcon,
  samsung: SamsungIcon,
  sonos: SonosIcon,
};

const platformDetails: any = {
  alexa: { name: 'Amazon Alexa', buttonText: 'Login with Amazon' },
  google: { name: 'Google Assistant', buttonText: 'Connect Google' },
  apple: { name: 'Apple Home', buttonText: 'Show HomeKit setup code' },
  samsung: { name: 'Samsung SmartThings', buttonText: 'Connect SmartThings' },
  sonos: {
    name: 'Sonos',
    buttonText: 'Connected via Alexa/Google',
    helper: 'Sonos will use your Alexa or Google connection',
  },
};

// -------- Amazon SDK Loader (robust) --------
let amazonSdkPromise: Promise<any> | null = null;

function getAmazonClientId(): string {
  const id = (import.meta as any).env?.VITE_AMAZON_CLIENT_ID;
  return (id || '').trim();
}

function getReturnUrl(): string {
  const envUrl = (import.meta as any).env?.VITE_AMAZON_RETURN_URL;
  const fallback = `${window.location.origin}/onboarding/step2`;
  return (envUrl || fallback).trim();
}

function waitFor(condition: () => boolean, timeoutMs = 12000, intervalMs = 50) {
  return new Promise<void>((resolve, reject) => {
    const start = Date.now();
    const t = setInterval(() => {
      if (condition()) {
        clearInterval(t);
        resolve();
      } else if (Date.now() - start > timeoutMs) {
        clearInterval(t);
        reject(new Error('Timed out waiting for Amazon Login SDK'));
      }
    }, intervalMs);
  });
}

async function loadAmazonSdk(): Promise<any> {
  if (amazonSdkPromise) return amazonSdkPromise;

  amazonSdkPromise = (async () => {
    const clientId = getAmazonClientId();
    if (!clientId) {
      throw new Error('Missing VITE_AMAZON_CLIENT_ID in frontend .env');
    }

    const w: any = window as any;
    if (w.amazon?.Login) {
      w.amazon.Login.setClientId(clientId);
      return w.amazon;
    }

    const existing = document.getElementById('amazon-login-sdk') as HTMLScriptElement | null;
    if (!existing) {
      const s = document.createElement('script');
      s.id = 'amazon-login-sdk';
      s.src = 'https://api-cdn.amazon.com/sdk/login1.js';
      s.async = true;
      s.defer = true;
      document.head.appendChild(s);
    }

    await waitFor(() => {
      const ww: any = window as any;
      return !!(ww.amazon && ww.amazon.Login && typeof ww.amazon.Login.setClientId === 'function');
    });

    const amazon = (window as any).amazon;
    amazon.Login.setClientId(clientId);
    return amazon;
  })();

  return amazonSdkPromise;
}

function randomState(len = 16) {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let out = '';
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}
// -------------------------------------------

export default function Step2ConnectAccounts({ onboardingData, setOnboardingData }: any) {
  const navigate = useNavigate();

  const selectedPlatforms = onboardingData.selectedPlatforms || [];

  // IMPORTANT: start every visit as "not connected"
  const [connectedPlatforms, setConnectedPlatforms] = useState<string[]>([]);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Force re-login behavior: every time Step2 loads, clear any remembered connection
  useEffect(() => {
    setConnectedPlatforms([]);

    // Also clear it from onboardingData so refresh/back doesn't keep it
    setOnboardingData((prev: any) => ({
      ...prev,
      connectedPlatforms: [],
    }));

    // OPTIONAL but recommended: clear server-side saved token so backend doesn't say "connected"
    // If you add the backend route, this will work. If not, it just fails silently.
    (async () => {
      try {
        await apiFetch('/api/integrations/alexa/logout', { method: 'POST' });
      } catch {
        // ignore
      }
    })();

    // Also try to log out from Amazon SDK context (helps avoid silent auth)
    (async () => {
      try {
        const amazon = await loadAmazonSdk();
        if (amazon?.Login?.logout) amazon.Login.logout();
      } catch {
        // ignore
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const markConnected = (platformId: string) => {
    setConnectedPlatforms((prev) => (prev.includes(platformId) ? prev : [...prev, platformId]));
  };

  const connectAmazonPopup = async () => {
    setError(null);
    setConnecting('alexa');

    try {
      const amazon = await loadAmazonSdk();
      const returnUrl = getReturnUrl();

      // Force prompt-like behavior as much as possible
      // (logout() above helps; extra fields are safe even if SDK ignores them)
      try {
        if (amazon?.Login?.logout) amazon.Login.logout();
      } catch {
        // ignore
      }

      const options: any = {
        scope: 'profile',
        response_type: 'token',
        redirect_uri: returnUrl,
        popup: true,
        state: randomState(),

        // best-effort "force login" hints (ignored if unsupported)
        prompt: 'login',
        interactive: 'always',
      };

      amazon.Login.authorize(options, async (response: any) => {
        if (response?.error) {
          setError(
            response.error_description ||
              'Amazon login failed or was cancelled. Please try again.'
          );
          setConnecting(null);
          return;
        }

        const accessToken = response?.access_token;
        if (!accessToken) {
          setError('Amazon did not return an access token. Check return URL settings.');
          setConnecting(null);
          return;
        }

        // Correct SDK usage: retrieveProfile(callback)
        let profile: any = null;
        try {
          await new Promise<void>((resolve) => {
            amazon.Login.retrieveProfile((profileResponse: any) => {
              if (profileResponse?.success) profile = profileResponse.profile;
              resolve();
            });
          });
        } catch {
          // ignore
        }

        // Save to backend
        try {
          const r = await apiFetch('/api/integrations/alexa/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ accessToken, profile }),
          });

          if (!r.ok) {
            const msg = await r.text().catch(() => '');
            throw new Error(`Backend /alexa/login failed: ${r.status} ${msg}`);
          }
        } catch {
          setError('Connected to Amazon, but backend could not save connection.');
          // still allow user to proceed if they want
        }

        markConnected('alexa');
        setConnecting(null);
      });
    } catch (e: any) {
      setConnecting(null);
      setError(e?.message || 'Could not start Amazon login. Check console.');
    }
  };

  const handleConnect = async (platformId: string) => {
    setError(null);

    if (platformId === 'alexa') {
      await connectAmazonPopup();
      return;
    }

    // other platforms still mock
    markConnected(platformId);
  };

  const handleNext = () => {
    setOnboardingData({ ...onboardingData, connectedPlatforms });
    navigate('/onboarding/step3');
  };

  const isBusy = connecting === 'alexa';

  return (
    <div className="min-h-screen bg-slate-950 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <Logo className="mb-8" />
        <ProgressIndicator currentStep={2} totalSteps={6} />

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 md:p-12">
          <h1 className="text-white mb-4">Connect your accounts</h1>
          <p className="text-slate-300 mb-4">
            Connect your smart home accounts so we can discover your devices and schedule Adhan safely.
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
                          <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
                            <CheckCircle className="w-3 h-3 mr-1" />
                            Connected
                          </Badge>
                        ) : (
                          <div className="text-slate-400 text-sm">
                            {platformId === 'alexa' && isBusy
                              ? 'Waiting for Amazon login…'
                              : 'Not connected'}
                          </div>
                        )}

                        {platform.helper && (
                          <div className="text-slate-500 text-sm mt-1">{platform.helper}</div>
                        )}
                      </div>
                    </div>

                    <div>
                      <Button
                        onClick={() => handleConnect(platformId)}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white"
                        size="sm"
                        disabled={(platformId === 'alexa' && isBusy) || platformId === 'sonos'}
                      >
                        {platformId === 'alexa' && isBusy
                          ? 'Connecting…'
                          : platform.buttonText}
                      </Button>
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
