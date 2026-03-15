import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Logo } from "../shared/Logo";
import { ProgressIndicator } from "../shared/ProgressIndicator";
import { AlexaIcon, AppleIcon, GoogleIcon } from "../shared/BrandIcons";
import {
  apiFetch,
  clearStoredAmazonToken,
  getStoredAmazonToken,
  restoreAmazonTokenFromUrl,
  setStoredAmazonToken,
} from "../../lib/api";
import {
  ensureAmazonSdk,
  getAmazonClientId,
  getAmazonReturnUrl,
} from "../../lib/amazonLogin";

type AmazonAuthorizeResponse = {
  access_token?: string;
  error?: string;
  error_description?: string;
  [key: string]: unknown;
};

type PlatformKey = "alexa" | "google" | "apple";

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
  apple?: { connected: boolean; linkedAt: string | null };
};

const LS_CONNECTED = "adhan_connected_platforms";
const LS_TOKENS = "adhan_tokens";

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

export default function Step2ConnectAccounts({
  onboardingData,
  setOnboardingData,
}: Props) {
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
        key: "alexa" as const,
        name: "Amazon Alexa",
        desc: "Required for backend-linked Adhan playback and protected settings.",
        Icon: AlexaIcon,
        badge: "Required",
      },
      {
        key: "google" as const,
        name: "Google",
        desc: "Calendar and reminders support will be added later.",
        Icon: GoogleIcon,
        badge: "Soon",
      },
      {
        key: "apple" as const,
        name: "Apple",
        desc: "Apple notifications support will be added later.",
        Icon: AppleIcon,
        badge: "Soon",
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
      const resp = await apiFetch("/api/integrations");
      if (!resp.ok) {
        if (resp.status === 401) {
          setServerStatus(null);
        }
        return;
      }

      const data = (await resp.json()) as IntegrationStatus;
      setServerStatus(data);

      if (data?.alexa?.connected) {
        markConnected("alexa");
      }
    } catch {
      setServerStatus(null);
    }
  }

  async function completeAlexaLogin(accessToken: string) {
    setStoredAmazonToken(accessToken);

    const linkRes = await apiFetch("/api/integrations/alexa/login", {
      method: "POST",
      body: JSON.stringify({ accessToken }),
    });

    if (!linkRes.ok) {
      const msg = await linkRes.text().catch(() => "");
      throw new Error(`Backend link failed (${linkRes.status}). ${msg}`.trim());
    }

    setTokens((prev) => ({ ...prev, alexa: accessToken }));
    markConnected("alexa");
    await refreshServerStatus();
  }

  useEffect(() => {
    const boot = async () => {
      const restoredToken = restoreAmazonTokenFromUrl();

      if (restoredToken) {
        try {
          setLoadingKey("alexa");
          setError(null);
          await completeAlexaLogin(restoredToken);
        } catch (e: unknown) {
          setError(e instanceof Error ? e.message : "Alexa connection failed.");
        } finally {
          setLoadingKey(null);
        }
        return;
      }

      if (getStoredAmazonToken()) {
        markConnected("alexa");
      }

      await refreshServerStatus();
    };

    void boot();
  }, []);

  async function connectAlexa() {
    setError(null);
    setLoadingKey("alexa");

    const clientId = getAmazonClientId();
    const redirectUri = getAmazonReturnUrl();

    if (!clientId || clientId === "undefined") {
      setLoadingKey(null);
      setError("Amazon Client ID is missing in the frontend build.");
      return;
    }

    if (!redirectUri || redirectUri === "undefined") {
      setLoadingKey(null);
      setError("Amazon Return URL is missing in the frontend build.");
      return;
    }

    try {
      await ensureAmazonSdk();

      const tokenResp = await new Promise<AmazonAuthorizeResponse>((resolve, reject) => {
        window.amazon?.Login?.authorize?.(
          {
            client_id: clientId,
            scope: "profile",
            response_type: "token",
            redirect_uri: redirectUri,
            popup: true,
            state: `adhan_${Date.now()}`,
          },
          (res: AmazonAuthorizeResponse | null) => {
            if (!res) {
              reject(new Error("No response from Amazon login."));
              return;
            }

            if (typeof res.error === "string") {
              reject(new Error(String(res.error_description || res.error)));
              return;
            }

            resolve(res);
          }
        );
      });

      const accessToken: string | undefined = tokenResp?.access_token;
      if (!accessToken) {
        throw new Error("Amazon did not return an access token.");
      }

      await completeAlexaLogin(accessToken);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Alexa connection failed.");
    } finally {
      setLoadingKey(null);
    }
  }

  async function disconnectAlexa() {
    setError(null);
    setLoadingKey("alexa");

    try {
      await apiFetch("/api/integrations/alexa/disconnect", {
        method: "POST",
      }).catch(() => undefined);

      try {
        window.amazon?.Login?.logout?.();
      } catch {
        // ignore Amazon SDK logout errors
      }

      clearStoredAmazonToken();
      markDisconnected("alexa");
      setServerStatus(null);
    } finally {
      setLoadingKey(null);
    }
  }

  async function handleConnect(key: PlatformKey) {
    if (key === "alexa") {
      await connectAlexa();
      return;
    }
    setError(`${key.toUpperCase()} integration is coming soon.`);
  }

  async function handleDisconnect(key: PlatformKey) {
    if (key === "alexa") {
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
    navigate("/onboarding/step3");
  }

  const canContinue = isConnected("alexa") || !!serverStatus?.alexa?.connected;

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30">
      <div className="mx-auto max-w-3xl px-6 py-10">
        <div className="flex items-center justify-between">
          <Logo />
          <ProgressIndicator currentStep={2} totalSteps={6} />
        </div>

        <div className="mt-8">
          <h1 className="text-2xl font-semibold">Connect your accounts</h1>
          <p className="mt-2 text-muted-foreground">
            Amazon Alexa is required so your settings, devices, and prayer times can
            be loaded from Azure-backed APIs.
          </p>
        </div>

        {error && (
          <div className="mt-6 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm">
            {error}
          </div>
        )}

        <div className="mt-8 space-y-4">
          {platforms.map((platform) => {
            const connected = isConnected(platform.key);
            const busy = loadingKey === platform.key;
            const serverConnected =
              platform.key === "alexa" ? !!serverStatus?.alexa?.connected : false;

            return (
              <div
                key={platform.key}
                className="flex items-center justify-between rounded-xl border bg-card p-5 shadow-sm"
              >
                <div className="flex items-center gap-4">
                  <div className="grid h-11 w-11 place-items-center rounded-lg bg-muted">
                    <platform.Icon className="h-6 w-6" />
                  </div>

                  <div>
                    <div className="flex items-center gap-2">
                      <div className="font-medium">{platform.name}</div>
                      <Badge variant="secondary">{platform.badge}</Badge>
                      {connected && <Badge>Connected</Badge>}
                      {serverConnected && <Badge variant="outline">Server linked</Badge>}
                    </div>

                    <div className="text-sm text-muted-foreground">{platform.desc}</div>
                  </div>
                </div>

                {!connected ? (
                  <Button
                    onClick={() => void handleConnect(platform.key)}
                    disabled={busy}
                    variant={platform.key === "alexa" ? "default" : "secondary"}
                  >
                    {busy ? "Connecting..." : "Connect"}
                  </Button>
                ) : (
                  <Button
                    onClick={() => void handleDisconnect(platform.key)}
                    disabled={busy}
                    variant="outline"
                  >
                    {busy ? "Disconnecting..." : "Disconnect"}
                  </Button>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-10 flex items-center justify-between">
          <Button variant="ghost" onClick={() => navigate("/onboarding/step1")}>
            Back
          </Button>

          <Button onClick={handleContinue} disabled={!canContinue}>
            Continue
          </Button>
        </div>
      </div>
    </div>
  );
}
