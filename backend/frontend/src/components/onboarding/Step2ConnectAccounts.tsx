import { useEffect, useState } from "react";
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
  [key: string]: unknown;
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
    readiness?: AlexaReadiness;
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
  readiness?: AlexaReadiness;
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

type AlexaReadiness = {
  amazonConnected?: boolean;
  appToAppLinked?: boolean;
  skillEnabled?: boolean;
  skillAccountLinked?: boolean;
  readyForPlayback?: boolean;
  connectionStage?: string | null;
  statusLabel?: string | null;
  invocationName?: string | null;
  skillId?: string | null;
  skillStage?: "development" | "live" | null;
  endpointHost?: string | null;
  enablementStatus?: string | null;
  accountLinkStatus?: string | null;
};


const LS_CONNECTED = "adhan_connected_platforms";
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
  return `${window.location.origin}/onboarding/step2`;
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

  useEffect(() => {
    writeJson(LS_CONNECTED, connectedPlatforms);
  }, [connectedPlatforms]);

  useEffect(() => {
    try {
      localStorage.removeItem("adhan_tokens");
    } catch {
      // ignore storage cleanup failures
    }
  }, []);

  const platforms = [
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
  ];

  const isConnected = (key: PlatformKey) => connectedPlatforms.includes(key);

  const markConnected = (key: PlatformKey) => {
    setConnectedPlatforms((prev) => (prev.includes(key) ? prev : [...prev, key]));
  };

  const markDisconnected = (key: PlatformKey) => {
    setConnectedPlatforms((prev) => prev.filter((p) => p !== key));
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

    markConnected("alexa");
    setInfo("Amazon account connected. You can now enable the Alexa skill from this screen.");

    void refreshServerStatus();
    void refreshAlexaLinkStatus();
  }

  async function finalizeAlexaSkillLink(code: string, state: string) {
    const pending = readPendingAlexaLink();
    if (!pending || pending.state !== state) {
      clearPendingAlexaLink();
      cleanCurrentUrl();
      throw new Error("Alexa returned to the app, but the linking session could not be verified.");
    }

    cleanCurrentUrl();

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
      let msg = "";
      try {
        const data = await resp.json();
        msg = typeof data?.error === "string" ? data.error : JSON.stringify(data);
      } catch {
        msg = await resp.text().catch(() => "");
      }
      clearPendingAlexaLink();
      throw new Error(`Alexa linking failed (${resp.status}). ${msg}`.trim());
    }

    clearPendingAlexaLink();
    await Promise.all([refreshServerStatus(), refreshAlexaLinkStatus()]);
    setInfo("Alexa skill enabled and account linking completed.");
  }

  useEffect(() => {
    const boot = async () => {
      const restoredToken = restoreAmazonTokenFromUrl();
      const params = new URLSearchParams(window.location.search || "");
      const returnedCode = params.get("code");
      const returnedState = params.get("state");
      const returnedScope = params.get("scope");
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
          if (
            returnedScope &&
            !returnedScope.split(/\s+/).includes("alexa::skills:account_linking")
          ) {
            throw new Error(
              `Alexa returned the wrong scope (${returnedScope}). The linking request must use alexa::skills:account_linking.`
            );
          }

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
    });
    navigate("/onboarding/step3");
  }

  const amazonConnected = !!serverStatus?.alexa?.connected || isConnected("alexa");
  const skillLinked =
    !!serverStatus?.alexa?.skillLinked ||
    alexaStatus?.accountLinkStatus === "LINKED" ||
    alexaStatus?.linked === true;
  const alexaReadiness = alexaStatus?.readiness || serverStatus?.alexa?.readiness || null;
  const continueEnabled = amazonConnected;

  const readinessChecks = [
    {
      key: "amazon",
      label: "Amazon sign-in",
      value: alexaReadiness?.amazonConnected ?? amazonConnected,
    },
    {
      key: "appLink",
      label: "App-to-app link",
      value: alexaReadiness?.appToAppLinked ?? serverStatus?.alexa?.appToAppLinked ?? false,
    },
    {
      key: "skillEnabled",
      label: "Skill enabled",
      value: alexaReadiness?.skillEnabled ?? serverStatus?.alexa?.skillEnabled ?? false,
    },
    {
      key: "skillAccount",
      label: "Skill account linked",
      value: alexaReadiness?.skillAccountLinked ?? skillLinked,
    },
  ];

  return (
    <div className="min-h-screen bg-slate-950">
      <div className="sticky top-0 z-20 bg-slate-950/95 backdrop-blur-sm border-b border-slate-800/50">
        <div className="max-w-7xl mx-auto px-4 py-4 md:px-6">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <Logo />
            <ProgressIndicator currentStep={2} totalSteps={6} />
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8 md:py-12">
        <div className="mb-8 md:mb-10">
          <h1 className="text-3xl md:text-4xl font-semibold text-white mb-3">
            Connect your account
          </h1>
          <p className="text-base md:text-lg text-slate-400 leading-relaxed max-w-2xl">
            Sign in with Amazon to connect your Alexa devices. We&apos;ll guide you through enabling the Alexa skill in the next step.
          </p>
        </div>

        <div className="rounded-3xl border border-slate-800/60 bg-slate-900/40 backdrop-blur-sm p-6 md:p-10">
          {error && (
            <div className="mb-6 rounded-xl border border-red-500/50 bg-red-500/10 px-5 py-4">
              <p className="text-red-300 text-sm leading-relaxed">{error}</p>
            </div>
          )}

          {info && (
            <div className="mb-6 rounded-xl border border-emerald-500/50 bg-emerald-500/10 px-5 py-4">
              <p className="text-emerald-300 text-sm leading-relaxed">{info}</p>
            </div>
          )}

          <div className="space-y-4 mb-8">
            {platforms.map((platform) => {
              const busy = loadingKey === platform.key;
              const serverConnected =
                platform.key === "alexa" ? !!serverStatus?.alexa?.connected : false;
              const linked = platform.key === "alexa" ? skillLinked : false;
              const disabled = platform.key !== "alexa";

              return (
                <div
                  key={platform.key}
                  className={`rounded-2xl border-2 p-6 transition-all ${
                    disabled
                      ? "border-slate-800/50 bg-slate-900/30 opacity-60"
                      : linked
                      ? "border-emerald-500/40 bg-emerald-500/10"
                      : serverConnected
                      ? "border-sky-500/40 bg-sky-500/5"
                      : "border-slate-800/60 bg-slate-900/60"
                  }`}
                >
                  <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
                    <div className="flex items-start gap-4 flex-1">
                      <div
                        className={`grid h-16 w-16 place-items-center rounded-xl ${
                          linked
                            ? "bg-emerald-500/10 ring-2 ring-emerald-500/30"
                            : serverConnected
                            ? "bg-sky-500/10 ring-2 ring-sky-500/30"
                            : "bg-slate-800/60 ring-1 ring-slate-700/60"
                        }`}
                      >
                        <platform.Icon className="h-9 w-9" />
                      </div>

                      <div className="space-y-2.5 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="font-semibold text-white text-lg">{platform.name}</div>
                          {platform.badge && (
                            <Badge
                              variant={platform.key === "alexa" ? "default" : "secondary"}
                              className={
                                platform.key === "alexa"
                                  ? "bg-emerald-600 hover:bg-emerald-600"
                                  : ""
                              }
                            >
                              {platform.badge}
                            </Badge>
                          )}
                        </div>

                        <div className="text-sm text-slate-400 leading-relaxed">
                          {platform.desc}
                        </div>

                        {platform.key === "alexa" && serverConnected && (
                          <div className="flex flex-wrap items-center gap-3 pt-2">
                            {serverStatus?.alexa?.displayName && (
                              <div className="flex items-center gap-2 text-sm">
                                <div className="h-2 w-2 rounded-full bg-emerald-500" />
                                <span className="text-slate-300">
                                  Signed in as{" "}
                                  <span className="font-medium text-white">
                                    {serverStatus.alexa.displayName}
                                  </span>
                                </span>
                              </div>
                            )}
                            {linked && (
                              <div className="flex items-center gap-2 text-sm">
                                <div className="h-2 w-2 rounded-full bg-emerald-500" />
                                <span className="text-emerald-400 font-medium">
                                  Alexa skill enabled
                                </span>
                              </div>
                            )}
                          </div>
                        )}

                        {platform.key === "alexa" && serverConnected && (
                          <details className="text-xs text-slate-500 pt-1">
                            <summary className="cursor-pointer hover:text-slate-400 transition-colors">
                              View technical details
                            </summary>
                            <div className="flex flex-wrap gap-2 mt-2 pl-3">
                              <span>App: {serverConnected ? "connected" : "not connected"}</span>
                              <span>•</span>
                              <span>
                                Skill:{" "}
                                {linked
                                  ? "linked"
                                  : alexaStatus?.enablementStatus ||
                                    serverStatus?.alexa?.skillStatus ||
                                    "not linked"}
                              </span>
                              {alexaStatus?.invocationName && (
                                <>
                                  <span>•</span>
                                  <span>Invocation: {alexaStatus.invocationName}</span>
                                </>
                              )}
                            </div>
                          </details>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 md:flex-col md:items-stretch md:min-w-[160px]">
                      {platform.key === "alexa" ? (
                        !serverConnected ? (
                          <Button
                            onClick={() => void handleConnect(platform.key)}
                            disabled={busy}
                            className="flex-1 md:w-full bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white h-11"
                          >
                            {busy ? "Connecting…" : "Sign in with Amazon"}
                          </Button>
                        ) : linked ? (
                          <>
                            <Button variant="secondary" disabled className="flex-1 md:w-full">
                              ✓ Connected
                            </Button>
                            <Button
                              onClick={() => void handleDisconnect(platform.key)}
                              disabled={busy}
                              variant="outline"
                              className="border-slate-700 text-slate-300 hover:bg-slate-800"
                            >
                              {busy ? "Disconnecting…" : "Disconnect"}
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button
                              onClick={() => void handleConnect(platform.key)}
                              disabled={busy}
                              className="flex-1 md:w-full bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white h-11"
                            >
                              {busy ? "Opening…" : "Enable Alexa skill"}
                            </Button>
                            <Button
                              onClick={() => void handleDisconnect(platform.key)}
                              disabled={busy}
                              variant="outline"
                              className="border-slate-700 text-slate-300 hover:bg-slate-800 text-sm"
                            >
                              {busy ? "Disconnecting…" : "Disconnect"}
                            </Button>
                          </>
                        )
                      ) : (
                        <Button disabled variant="secondary" className="flex-1 md:w-full">
                          Coming Soon
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mb-8 rounded-2xl border border-slate-700/50 bg-slate-800/30 p-5">
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-emerald-500/10 p-2 mt-0.5">
                <svg
                  className="w-5 h-5 text-emerald-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
              <div className="flex-1">
                <div className="font-medium text-white mb-2 text-sm">How this works</div>
                <div className="space-y-1.5 text-sm text-slate-400 leading-relaxed">
                  <div>• First, sign in with your Amazon account to access this app</div>
                  <div>• Then, enable the Alexa skill to control your devices</div>
                  <div>• You&apos;ll configure prayer times and device settings in the next steps</div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <Button
              variant="outline"
              onClick={() => navigate("/onboarding/step1")}
              className="flex-1 border-slate-700 text-slate-300 hover:bg-slate-800 h-11"
            >
              Back
            </Button>

            <Button
              onClick={handleContinue}
              disabled={!continueEnabled}
              className="flex-1 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white h-11 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {continueEnabled ? "Continue to location" : "Connect Amazon to continue"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}