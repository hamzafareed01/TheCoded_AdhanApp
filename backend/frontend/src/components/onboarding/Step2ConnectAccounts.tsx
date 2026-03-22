import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, CheckCircle2, Loader2, ShieldCheck } from 'lucide-react';

import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Logo } from '../shared/Logo';
import { ProgressIndicator } from '../shared/ProgressIndicator';
import { AlexaIcon, GoogleIcon } from '../shared/BrandIcons';
import {
  apiFetch,
  clearStoredAmazonToken,
  getStoredAmazonToken,
  restoreAmazonTokenFromUrl,
  setStoredAmazonToken,
} from '../../lib/api';
import { ensureAmazonSdk, getAmazonClientId, getAmazonReturnUrl } from '../../lib/amazonLogin';

type AmazonAuthorizeResponse = {
  access_token?: string;
  error?: string;
  error_description?: string;
  [key: string]: unknown;
};

type PlatformKey = 'alexa' | 'google';

type OnboardingData = {
  connectedPlatforms?: PlatformKey[];
  tokens?: Record<string, string>;
};

type Props = {
  onboardingData?: OnboardingData;
  setOnboardingData?: (data: OnboardingData) => void;
};

type IntegrationStatus = {
  userKey?: string;
  alexa?: {
    connected: boolean;
    linkedAt: string | null;
    displayName: string | null;
    accountId?: string | null;
  };
  google?: { connected: boolean; linkedAt: string | null };
};

const LS_CONNECTED = 'adhan_connected_platforms';
const LS_TOKENS = 'adhan_tokens';

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value));
}

export default function Step2ConnectAccounts({ onboardingData, setOnboardingData }: Props) {
  const navigate = useNavigate();

  const [loadingKey, setLoadingKey] = useState<PlatformKey | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [serverStatus, setServerStatus] = useState<IntegrationStatus | null>(null);

  const [connectedPlatforms, setConnectedPlatforms] = useState<PlatformKey[]>(() =>
    readJson<PlatformKey[]>(LS_CONNECTED, onboardingData?.connectedPlatforms ?? [])
  );

  const [tokens, setTokens] = useState<Record<string, string>>(() =>
    readJson<Record<string, string>>(LS_TOKENS, onboardingData?.tokens ?? {})
  );

  useEffect(() => {
    writeJson(LS_CONNECTED, connectedPlatforms);
  }, [connectedPlatforms]);

  useEffect(() => {
    writeJson(LS_TOKENS, tokens);
  }, [tokens]);

  const platforms = useMemo(
    () => [
      {
        key: 'alexa' as const,
        name: 'Amazon Alexa',
        desc: 'Required for backend-linked Adhan playback and protected settings.',
        Icon: AlexaIcon,
        badge: 'Required',
        available: true,
      },
      {
        key: 'google' as const,
        name: 'Google Assistant',
        desc: 'Google Assistant support is coming soon.',
        Icon: GoogleIcon,
        badge: 'Coming Soon',
        available: false,
      },
    ],
    []
  );

  const isConnected = (key: PlatformKey) => connectedPlatforms.includes(key);

  const markConnected = (key: PlatformKey) => {
    setConnectedPlatforms((prev) => (prev.includes(key) ? prev : [...prev, key]));
  };

  const markDisconnected = (key: PlatformKey) => {
    setConnectedPlatforms((prev) => prev.filter((p) => p !== key));
    setTokens((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  async function refreshServerStatus() {
    const token = getStoredAmazonToken();
    if (!token) {
      setServerStatus(null);
      return;
    }

    try {
      const resp = await apiFetch('/api/integrations');
      if (!resp.ok) {
        if (resp.status === 401) {
          clearStoredAmazonToken();
          markDisconnected('alexa');
          setServerStatus(null);
        }
        return;
      }

      const data = (await resp.json()) as IntegrationStatus;
      setServerStatus(data);

      if (data?.alexa?.connected) {
        markConnected('alexa');
      }
    } catch {
      setServerStatus(null);
    }
  }

  async function completeAlexaLogin(accessToken: string) {
    setStoredAmazonToken(accessToken);

    const linkRes = await apiFetch('/api/integrations/alexa/login', {
      method: 'POST',
      body: JSON.stringify({ accessToken }),
    });

    if (!linkRes.ok) {
      const msg = await linkRes.text().catch(() => '');
      throw new Error(`Backend link failed (${linkRes.status}). ${msg}`.trim());
    }

    setTokens((prev) => ({ ...prev, alexa: accessToken }));
    markConnected('alexa');
    await refreshServerStatus();
  }

  useEffect(() => {
    const boot = async () => {
      const restoredToken = restoreAmazonTokenFromUrl();

      if (restoredToken) {
        try {
          setLoadingKey('alexa');
          setError(null);
          await completeAlexaLogin(restoredToken);
        } catch (e: unknown) {
          setError(e instanceof Error ? e.message : 'Alexa connection failed.');
        } finally {
          setLoadingKey(null);
        }
        return;
      }

      if (getStoredAmazonToken()) {
        markConnected('alexa');
      }

      await refreshServerStatus();
    };

    void boot();
  }, []);

  async function connectAlexa() {
    setError(null);
    setLoadingKey('alexa');

    const clientId = getAmazonClientId();
    const redirectUri = getAmazonReturnUrl();

    if (!clientId || clientId === 'undefined') {
      setLoadingKey(null);
      setError('Amazon Client ID is missing in the frontend build.');
      return;
    }

    if (!redirectUri || redirectUri === 'undefined') {
      setLoadingKey(null);
      setError('Amazon Return URL is missing in the frontend build.');
      return;
    }

    try {
      await ensureAmazonSdk();

      const tokenResp = await new Promise<AmazonAuthorizeResponse>((resolve, reject) => {
        window.amazon?.Login?.authorize?.(
          {
            client_id: clientId,
            scope: 'profile',
            response_type: 'token',
            redirect_uri: redirectUri,
            popup: true,
            state: `adhan_${Date.now()}`,
          },
          (res: AmazonAuthorizeResponse | null) => {
            if (!res) {
              reject(new Error('No response from Amazon login.'));
              return;
            }

            if (typeof res.error === 'string') {
              reject(new Error(String(res.error_description || res.error)));
              return;
            }

            resolve(res);
          }
        );
      });

      const accessToken: string | undefined = tokenResp?.access_token;
      if (!accessToken) {
        throw new Error('Amazon did not return an access token.');
      }

      await completeAlexaLogin(accessToken);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Alexa connection failed.');
    } finally {
      setLoadingKey(null);
    }
  }

  async function disconnectAlexa() {
    setError(null);
    setLoadingKey('alexa');

    try {
      await apiFetch('/api/integrations/alexa/disconnect', {
        method: 'POST',
      }).catch(() => undefined);

      try {
        window.amazon?.Login?.logout?.();
      } catch {
        // ignore Amazon SDK logout errors
      }

      clearStoredAmazonToken();
      markDisconnected('alexa');
      setServerStatus(null);
    } finally {
      setLoadingKey(null);
    }
  }

  async function handleConnect(key: PlatformKey) {
    if (key === 'alexa') {
      await connectAlexa();
      return;
    }
    setError(`${key.toUpperCase()} integration is coming soon.`);
  }

  async function handleDisconnect(key: PlatformKey) {
    if (key === 'alexa') {
      await disconnectAlexa();
      return;
    }
    markDisconnected(key);
  }

  function handleContinue() {
    setOnboardingData?.({
      ...(onboardingData || {}),
      connectedPlatforms,
      tokens,
    });
    navigate('/onboarding/step3');
  }

  const canContinue = isConnected('alexa') || !!serverStatus?.alexa?.connected;

  return (
    <div className="min-h-screen bg-slate-950 py-8 px-4">
      <div className="mx-auto max-w-5xl">
        <div className="flex items-center justify-between gap-4 mb-8">
          <Logo />
          <ProgressIndicator currentStep={2} totalSteps={6} />
        </div>

        <div className="max-w-3xl mb-8">
          <h1 className="text-3xl md:text-4xl font-semibold text-white">Connect your accounts</h1>
          <p className="mt-3 text-lg text-slate-300">
            Amazon Alexa is required so your settings, devices, and prayer times can be loaded from Azure-backed APIs.
          </p>
        </div>

        {error && (
          <div className="mb-6 flex items-start gap-3 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-5 py-4 text-sm text-rose-100">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-300" />
            <div>{error}</div>
          </div>
        )}

        <div className="space-y-5">
          {platforms.map((platform) => {
            const connected = isConnected(platform.key);
            const busy = loadingKey === platform.key;
            const serverConnected = platform.key === 'alexa' ? !!serverStatus?.alexa?.connected : false;
            const displayName = platform.key === 'alexa' ? serverStatus?.alexa?.displayName : null;
            const isAvailable = platform.available;

            return (
              <div
                key={platform.key}
                className={`relative overflow-hidden rounded-2xl border-2 px-6 py-6 transition-all duration-300 ${
                  !isAvailable
                    ? 'border-slate-800 bg-slate-900/70 opacity-60'
                    : connected || serverConnected
                    ? 'border-emerald-500/50 bg-emerald-500/5 shadow-[0_22px_50px_rgba(16,185,129,0.10)]'
                    : 'border-slate-800 bg-slate-900/70 hover:border-emerald-500/30 hover:bg-slate-900'
                }`}
              >
                {(connected || serverConnected) && (
                  <div className="absolute -right-2 -top-2 flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500 shadow-lg shadow-emerald-500/30">
                    <CheckCircle2 className="h-5 w-5 text-white" />
                  </div>
                )}

                <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
                  <div className="flex items-start gap-4">
                    <div className={`grid h-16 w-16 place-items-center rounded-2xl ring-1 ${
                      connected || serverConnected ? 'bg-emerald-500/10 ring-emerald-500/20' : 'bg-slate-800 ring-slate-700'
                    }`}>
                      <platform.Icon className="h-9 w-9" />
                    </div>

                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-lg font-semibold text-white">{platform.name}</div>
                        <Badge
                          className={
                            platform.badge === 'Required'
                              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                              : 'border-slate-700 bg-slate-800 text-slate-300'
                          }
                        >
                          {platform.badge}
                        </Badge>
                        {serverConnected && (
                          <Badge className="border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/10">
                            <span className="mr-2 inline-flex h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                            Active
                          </Badge>
                        )}
                      </div>

                      <p className="text-sm leading-6 text-slate-400 max-w-2xl">{platform.desc}</p>

                      {platform.key === 'alexa' && connected && displayName && (
                        <div className="text-sm text-emerald-300">Connected as: {displayName}</div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {!connected ? (
                      <Button
                        onClick={() => void handleConnect(platform.key)}
                        disabled={busy || !isAvailable}
                        className={
                          isAvailable
                            ? 'min-w-[120px] bg-white text-slate-950 hover:bg-slate-100'
                            : 'min-w-[120px] bg-slate-800 text-slate-400 hover:bg-slate-800'
                        }
                        size="lg"
                      >
                        {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        {busy ? 'Connecting...' : 'Connect'}
                      </Button>
                    ) : (
                      <Button
                        onClick={() => void handleDisconnect(platform.key)}
                        disabled={busy}
                        variant="outline"
                        className="min-w-[120px] border-slate-700 text-slate-200 hover:bg-slate-800"
                        size="lg"
                      >
                        {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        {busy ? 'Disconnecting...' : 'Disconnect'}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-6 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 px-5 py-4 text-sm text-slate-200">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" />
            <div>
              <div className="mb-1 flex items-center gap-2 font-medium text-white">
                <span className="inline-flex h-2 w-2 rounded-full bg-emerald-400" />
                Privacy & Security
              </div>
              <p className="text-slate-300 leading-6">
                Your Alexa connection is used only to link your account securely, sync devices, and prepare protected Adhan playback settings.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-10 flex items-center justify-between gap-4">
          <Button variant="ghost" className="text-slate-300 hover:bg-slate-900 hover:text-white" onClick={() => navigate('/onboarding/step1')}>
            Back
          </Button>

          <Button
            onClick={handleContinue}
            disabled={!canContinue}
            className="bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white"
            size="lg"
          >
            Continue
          </Button>
        </div>
      </div>
    </div>
  );
}
