import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Logo } from "../shared/Logo";
import { ProgressIndicator } from "../shared/ProgressIndicator";
import { AlexaIcon, GoogleIcon, AppleIcon } from "../shared/BrandIcons";
import { apiFetch } from "../../lib/api";

declare global {
  interface Window {
    amazon?: any;
  }
}

type PlatformKey = "alexa" | "google" | "apple";

interface OnboardingData {
  connectedPlatforms?: PlatformKey[];
  tokens?: Record<string, string>;
}

interface Props {
  onboardingData?: OnboardingData;
  setOnboardingData?: (data: OnboardingData) => void;
}

// server integration shape from GET /api/integrations
type IntegrationStatus = {
  userKey: string;
  alexa: { connected: boolean; linkedAt: string | null; displayName: string | null; accountId: string | null };
  google: { connected: boolean; linkedAt: string | null };
  apple: { connected: boolean; linkedAt: string | null };
};

const LS_CONNECTED = "adhan_connected_platforms";
const LS_TOKENS = "adhan_tokens";
const LS_AMAZON_ACCESS = "amazon_access_token";

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value));
}

function loadAmazonSDK(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.amazon?.Login) return resolve();

    const existing = document.querySelector<HTMLScriptElement>(
      'script[src="https://assets.loginwithamazon.com/sdk/na/login1.js"]'
    );
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Amazon SDK load error")));
      return;
    }

    const s = document.createElement("script");
    s.src = "https://assets.loginwithamazon.com/sdk/na/login1.js";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Amazon SDK load error"));
    document.head.appendChild(s);
  });
}

function getAmazonClientId(): string {
  return (import.meta as any).env?.VITE_AMAZON_CLIENT_ID || (import.meta as any).env?.VITE_LWA_CLIENT_ID || "";
}

function getReturnUrl(): string {
  const env =
    (import.meta as any).env?.VITE_AMAZON_RETURN_URL ||
    (import.meta as any).env?.VITE_AMAZON_REDIRECT_URI ||
    "";
  if (env) return env;

  return `${window.location.origin}/onboarding/step2`;
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

  useEffect(() => writeJson(LS_CONNECTED, connectedPlatforms), [connectedPlatforms]);
  useEffect(() => writeJson(LS_TOKENS, tokens), [tokens]);

  const platforms = useMemo(
    () => [
      {
        key: "alexa" as const,
        name: "Amazon Alexa",
        desc: "Control Adhan & reminders using Alexa devices.",
        Icon: AlexaIcon,
        badge: "Recommended",
      },
      { key: "google" as const, name: "Google", desc: "Calendar + reminders (coming soon).", Icon: GoogleIcon, badge: "Soon" },
      { key: "apple" as const, name: "Apple", desc: "iOS notifications (coming soon).", Icon: AppleIcon, badge: "Soon" },
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
    try {
      const resp = await apiFetch("/api/integrations");
      if (!resp.ok) return;
      const data = (await resp.json()) as IntegrationStatus;
      setServerStatus(data);
    } catch {
      // ignore (UI should still work offline-ish)
    }
  }

  useEffect(() => {
    refreshServerStatus();
  }, []);

  async function connectAlexa() {
    setError(null);
    setLoadingKey("alexa");

    const clientId = getAmazonClientId();
    const redirectUri = getReturnUrl();

    if (!clientId) {
      setLoadingKey(null);
      setError(
        "Missing VITE_AMAZON_CLIENT_ID in the frontend build. Add it to GitHub Actions (Repository Variable/Secret) and redeploy the Static Web App."
      );
      return;
    }

    try {
      await loadAmazonSDK();

      const options = {
        scope: "profile",
        response_type: "token",
        redirect_uri: redirectUri,
        popup: true,
        state: `adhan_${Date.now()}`,
      };

      const tokenResp: any = await new Promise((resolve, reject) => {
        window.amazon.Login.authorize(options, (res: any) => {
          if (!res) return reject(new Error("No response from Amazon login."));
          if (res.error) return reject(new Error(res.error_description || res.error));
          resolve(res);
        });
      });

      const accessToken: string | undefined = tokenResp?.access_token;
      if (!accessToken) throw new Error("Amazon did not return an access token.");

      // store for api.ts Authorization auto-attach
      localStorage.setItem(LS_AMAZON_ACCESS, accessToken);

      const r = await apiFetch("/api/integrations/alexa/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken }),
      });

      if (!r.ok) {
        const msg = await r.text().catch(() => "");
        throw new Error(`Backend link failed (${r.status}). ${msg}`);
      }

      setTokens((prev) => ({ ...prev, alexa: accessToken }));
      markConnected("alexa");
      await refreshServerStatus();
    } catch (e: any) {
      setError(e?.message || "Alexa connection failed.");
    } finally {
      setLoadingKey(null);
    }
  }

  async function disconnectAlexa() {
    setError(null);
    setLoadingKey("alexa");

    try {
      await apiFetch("/api/integrations/alexa/disconnect", { method: "POST" }).catch(() => {});
      try {
        window.amazon?.Login?.logout?.();
      } catch {}

      localStorage.removeItem(LS_AMAZON_ACCESS);

      markDisconnected("alexa");
      await refreshServerStatus();
    } finally {
      setLoadingKey(null);
    }
  }

  async function handleConnect(key: PlatformKey) {
    if (key === "alexa") return connectAlexa();
    setError(`${key.toUpperCase()} integration is coming soon.`);
  }

  async function handleDisconnect(key: PlatformKey) {
    if (key === "alexa") return disconnectAlexa();
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
            Linking Alexa lets your settings follow you across devices and enables voice experiences.
          </p>
        </div>

        {error && (
          <div className="mt-6 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm">
            {error}
          </div>
        )}

        <div className="mt-8 space-y-4">
          {platforms.map((p) => {
            const connected = isConnected(p.key);
            const busy = loadingKey === p.key;

            const serverConnected =
              p.key === "alexa" ? !!serverStatus?.alexa?.connected : false;

            return (
              <div
                key={p.key}
                className="flex items-center justify-between rounded-xl border bg-card p-5 shadow-sm"
              >
                <div className="flex items-center gap-4">
                  <div className="grid h-11 w-11 place-items-center rounded-lg bg-muted">
                    <p.Icon className="h-6 w-6" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <div className="font-medium">{p.name}</div>
                      {p.badge && <Badge variant="secondary">{p.badge}</Badge>}
                      {connected && <Badge>Connected</Badge>}
                      {serverConnected && <Badge variant="outline">Server linked</Badge>}
                    </div>
                    <div className="text-sm text-muted-foreground">{p.desc}</div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {!connected ? (
                    <Button
                      onClick={() => handleConnect(p.key)}
                      disabled={busy}
                      variant={p.key === "alexa" ? "default" : "secondary"}
                    >
                      {busy ? "Connecting..." : "Connect"}
                    </Button>
                  ) : (
                    <Button onClick={() => handleDisconnect(p.key)} disabled={busy} variant="outline">
                      {busy ? "Disconnecting..." : "Disconnect"}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-10 flex items-center justify-between">
          <Button variant="ghost" onClick={() => navigate("/onboarding/step1")}>
            Back
          </Button>

          <Button onClick={handleContinue}>Continue</Button>
        </div>
      </div>
    </div>
  );
}