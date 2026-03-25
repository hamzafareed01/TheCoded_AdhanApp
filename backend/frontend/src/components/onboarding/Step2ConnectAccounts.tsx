import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Logo } from "../shared/Logo";
import { ProgressIndicator } from "../shared/ProgressIndicator";
import { AlexaIcon, GoogleIcon } from "../shared/BrandIcons";
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

type PlatformKey = "alexa" | "google";

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
    skillLinked?: boolean;
    skillEnabled?: boolean;
    skillStatus?: string | null;
    skillAccountLinkStatus?: string | null;
    appToAppLinked?: boolean;
  };
  google?: { connected: boolean; linkedAt: string | null };
};

type AlexaLinkStatus = {
  configured?: boolean;
  invocationName?: string | null;
  skillId?: string | null;
  skillStage?: "development" | "live" | null;
  linked?: boolean;
  lwaLinked?: boolean;
  enablementStatus?: string | null;
  accountLinkStatus?: string | null;
};

type AlexaLinkStartResponse = {
  authorizationUrl: string;
  state: string;
  codeVerifier: string;
  redirectUri: string;
};

type AlexaLinkPending = {
  state: string;
  codeVerifier: string;
  redirectUri: string;
  startedAt: number;
};

const LS_CONNECTED = "adhan_connected_platforms";
const LS_TOKENS = "adhan_tokens";
const LS_ALEXA_LINK_PENDING = "adhan_alexa_link_pending";

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

function readPendingAlexaLink(): AlexaLinkPending | null {
  try {
    const raw = sessionStorage.getItem(LS_ALEXA_LINK_PENDING);
    return raw ? (JSON.parse(raw) as AlexaLinkPending) : null;
  } catch {
    return null;
  }
}

function storePendingAlexaLink(value: AlexaLinkPending) {
  sessionStorage.setItem(LS_ALEXA_LINK_PENDING, JSON.stringify(value));
}

function clearPendingAlexaLink() {
  sessionStorage.removeItem(LS_ALEXA_LINK_PENDING);
}

function cleanCurrentUrl() {
  if (typeof window === "undefined") return;
  const cleanUrl = `${window.location.origin}${window.location.pathname}`;
  window.history.replaceState({}, document.title, cleanUrl);
}

function currentAlexaLinkUrl(): string {
  if (typeof window === "undefined") return "";
  return `${window.location.origin}/alexa/link`;
}

export default function Step2ConnectAccounts({
  onboardingData,
  setOnboardingData,
}: Props) {
  const navigate = useNavigate();

  const [loadingKey, setLoadingKey] = useState<PlatformKey | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [serverStatus, setServerStatus] = useState<IntegrationStatus | null>(null);
  const [alexaStatus, setAlexaStatus] = useState<AlexaLinkStatus | null>(null);

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
        desc: "Connect Amazon first, then enable the AdhanCast Alexa skill without making users search manually.",
        Icon: AlexaIcon,
        badge: "Required",
      },
      {
        key: "google" as const,
        name: "Google Assistant",
        desc: "Coming soon after Alexa linking is complete.",
        Icon: GoogleIcon,
        badge: "Coming Soon",
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
          clearStoredAmazonToken();
          clearPendingAlexaLink();
          markDisconnected("alexa");
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

  async function refreshAlexaLinkStatus() {
    const token = getStoredAmazonToken();
    if (!token) {
      setAlexaStatus(null);
      return;
    }

    try {
      const resp = await apiFetch("/api/alexa/account-linking/status");
      if (!resp.ok) return;
      const data = (await resp.json()) as AlexaLinkStatus;
      setAlexaStatus(data);
    } catch {
      setAlexaStatus(null);
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
    setInfo("Amazon account connected. You can now enable the Alexa skill from this screen.");

    void refreshServerStatus();
    void refreshAlexaLinkStatus();
  }

  async function finalizeAlexaSkillLink(code: string, state: string) {
    const pending = readPendingAlexaLink();
    if (!pending || pending.state !== state) {
      throw new Error("Alexa returned to the app, but the linking session could not be verified.");
    }

    const resp = await apiFetch("/api/alexa/account-linking/complete", {
      method: "POST",
      body: JSON.stringify({
        code,
        state,
        codeVerifier: pending.codeVerifier,
        redirectUri: pending.redirectUri,
      }),
    });

    if (!resp.ok) {
      const msg = await resp.text().catch(() => "");
      throw new Error(`Alexa linking failed (${resp.status}). ${msg}`.trim());
    }

    clearPendingAlexaLink();
    cleanCurrentUrl();
    await Promise.all([refreshServerStatus(), refreshAlexaLinkStatus()]);
    setInfo("Alexa skill enabled and account linking completed.");
  }

  useEffect(() => {
    const boot = async () => {
      const restoredToken = restoreAmazonTokenFromUrl();
      const params = new URLSearchParams(window.location.search || "");
      const returnedCode = params.get("code");
      const returnedState = params.get("state");
      const returnedError = params.get("error");
      const returnedErrorDescription = params.get("error_description");

      try {
        if (restoredToken) {
          setLoadingKey("alexa");
          setError(null);
          await completeAlexaLogin(restoredToken);
        } else if (getStoredAmazonToken()) {
          markConnected("alexa");
        }

        if (returnedError) {
          clearPendingAlexaLink();
          cleanCurrentUrl();
          setError(returnedErrorDescription || returnedError);
        } else if (returnedCode && returnedState && getStoredAmazonToken()) {
          setLoadingKey("alexa");
          setError(null);
          await finalizeAlexaSkillLink(returnedCode, returnedState);
        }
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Alexa connection failed.");
      } finally {
        setLoadingKey(null);
        await Promise.all([refreshServerStatus(), refreshAlexaLinkStatus()]);
      }
    };

    void boot();
  }, []);

  async function connectAlexa() {
    setError(null);
    setInfo(null);
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
      setInfo("Amazon account connected. You can now enable the Alexa skill from this screen.");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Alexa connection failed.");
    } finally {
      setLoadingKey(null);
    }
  }

async function startAlexaSkillLinking() {
  setError(null);
  setInfo(null);
  setLoadingKey("alexa");

  if (!getStoredAmazonToken()) {
    setLoadingKey(null);
    setError("Connect your Amazon account first.");
    return;
  }

  try {
    const redirectUri = currentAlexaLinkUrl();

    const resp = await apiFetch("/api/alexa/account-linking/start", {
      method: "POST",
      body: JSON.stringify({ redirectUri }),
    });

    if (!resp.ok) {
      const msg = await resp.text().catch(() => "");
      throw new Error(`Could not start Alexa linking (${resp.status}). ${msg}`.trim());
    }

    const data = (await resp.json()) as AlexaLinkStartResponse;

    storePendingAlexaLink({
      state: data.state,
      codeVerifier: data.codeVerifier,
      redirectUri: data.redirectUri,
      startedAt: Date.now(),
    });

    window.location.assign(data.authorizationUrl);
  } catch (e: unknown) {
    setLoadingKey(null);
    setError(e instanceof Error ? e.message : "Could not start Alexa linking.");
  }
}

  async function disconnectAlexa() {
    setError(null);
    setInfo(null);
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
      clearPendingAlexaLink();
      markDisconnected("alexa");
      setServerStatus(null);
      setAlexaStatus(null);
      setInfo("Amazon account disconnected and Alexa link removed.");
    } finally {
      setLoadingKey(null);
    }
  }

  async function handleConnect(key: PlatformKey) {
    if (key !== "alexa") {
      setError("Google Assistant is coming soon.");
      return;
    }

    if (!serverStatus?.alexa?.connected) {
      await connectAlexa();
      return;
    }

    if (serverStatus?.alexa?.skillLinked || alexaStatus?.accountLinkStatus === "LINKED") {
      setInfo("Alexa skill is already linked for this account.");
      return;
    }

    await startAlexaSkillLinking();
  }

  async function handleDisconnect(key: PlatformKey) {
    if (key === "alexa") {
      await disconnectAlexa();
    }
  }

  function handleContinue() {
    setOnboardingData?.({
      ...(onboardingData || {}),
      connectedPlatforms,
      tokens,
    });
    navigate("/onboarding/step3");
  }

  const amazonConnected = !!serverStatus?.alexa?.connected || isConnected("alexa");
  const skillLinked =
    !!serverStatus?.alexa?.skillLinked ||
    alexaStatus?.accountLinkStatus === "LINKED" ||
    alexaStatus?.linked === true;
  const continueEnabled = amazonConnected;

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
            Step 2 now does two things: connect your Amazon account for the app,
            then enable and link the Alexa skill from this same screen.
          </p>
        </div>

        {error && (
          <div className="mt-6 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive-foreground">
            {error}
          </div>
        )}

        {info && (
          <div className="mt-6 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-100">
            {info}
          </div>
        )}

        <div className="mt-8 space-y-4">
          {platforms.map((platform) => {
            const connected = isConnected(platform.key);
            const busy = loadingKey === platform.key;
            const serverConnected =
              platform.key === "alexa" ? !!serverStatus?.alexa?.connected : false;
            const linked = platform.key === "alexa" ? skillLinked : false;
            const disabled = platform.key !== "alexa";

            return (
              <div
                key={platform.key}
                className={`rounded-2xl border p-5 shadow-sm transition ${disabled
                    ? "border-border/50 bg-card/60 opacity-70"
                    : linked
                      ? "border-emerald-500/40 bg-emerald-500/5"
                      : serverConnected
                        ? "border-sky-500/40 bg-sky-500/5"
                        : "border-border bg-card"
                  }`}
              >
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div className="flex items-start gap-4">
                    <div className="grid h-14 w-14 place-items-center rounded-2xl bg-muted">
                      <platform.Icon className="h-8 w-8" />
                    </div>

                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="font-medium">{platform.name}</div>
                        <Badge variant={platform.key === "alexa" ? "default" : "secondary"}>
                          {platform.badge}
                        </Badge>
                        {serverConnected && <Badge variant="outline">Amazon connected</Badge>}
                        {linked && <Badge className="bg-emerald-600 hover:bg-emerald-600">Skill linked</Badge>}
                      </div>

                      <div className="text-sm text-muted-foreground">{platform.desc}</div>

                      {platform.key === "alexa" && serverStatus?.alexa?.displayName && (
                        <div className="text-sm text-muted-foreground">
                          Connected as: <span className="font-medium text-foreground">{serverStatus.alexa.displayName}</span>
                        </div>
                      )}

                      {platform.key === "alexa" && (
                        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                          <span>App login: {serverConnected ? "ready" : "not connected"}</span>
                          <span>•</span>
                          <span>
                            Skill: {linked ? "linked" : alexaStatus?.enablementStatus || serverStatus?.alexa?.skillStatus || "not linked"}
                          </span>
                          {alexaStatus?.invocationName && (
                            <>
                              <span>•</span>
                              <span>Invocation: {alexaStatus.invocationName}</span>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    {platform.key === "alexa" ? (
                      !serverConnected ? (
                        <Button onClick={() => void handleConnect(platform.key)} disabled={busy}>
                          {busy ? "Connecting…" : "Connect Amazon"}
                        </Button>
                      ) : linked ? (
                        <>
                          <Button variant="secondary" disabled>
                            Linked
                          </Button>
                          <Button onClick={() => void handleDisconnect(platform.key)} disabled={busy} variant="outline">
                            {busy ? "Disconnecting…" : "Disconnect"}
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button onClick={() => void handleConnect(platform.key)} disabled={busy}>
                            {busy ? "Opening Alexa…" : "Enable Alexa skill"}
                          </Button>
                          <Button onClick={() => void handleDisconnect(platform.key)} disabled={busy} variant="outline">
                            {busy ? "Disconnecting…" : "Disconnect"}
                          </Button>
                        </>
                      )
                    ) : (
                      <Button disabled variant="secondary">
                        Coming Soon
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-6 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-sm text-muted-foreground">
          <div className="font-medium text-foreground">What happens here</div>
          <div className="mt-2 space-y-1">
            <div>1. Connect Amazon so the app can save your settings and devices.</div>
            <div>2. Enable and link the Alexa skill from this same screen.</div>
            <div>3. Step 5 and Settings will stay the source of truth for reciters, devices, and after-Adhan playback.</div>
          </div>
        </div>

        <div className="mt-10 flex items-center justify-between">
          <Button variant="ghost" onClick={() => navigate("/onboarding/step1")}>
            Back
          </Button>

          <Button onClick={handleContinue} disabled={!continueEnabled}>
            Continue
          </Button>
        </div>
      </div>
    </div>
  );
}
