import { App as CapacitorApp } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { Capacitor } from "@capacitor/core";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Logo } from "../shared/Logo";
import { ProgressIndicator } from "../shared/ProgressIndicator";
import { AlexaIcon, GoogleIcon } from "../shared/BrandIcons";
import {
  apiFetchWithAmazonRepair,
  clearStoredAmazonToken,
  getStoredAmazonToken,
  restoreAmazonTokenFromUrl,
  setStoredAmazonToken,
  subscribeToAmazonAuthChanges,
} from "../../lib/api";
import {
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
  sessionToken?: string | null;
  sessionExpiresAt?: string | null;
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

const AMAZON_AUTHORIZE_URL = "https://www.amazon.com/ap/oa";
const AMAZON_LOGIN_STATE_PREFIX = "adhancast_amazon_login_";
const NATIVE_LOGIN_STATE_PREFIX = "adhancast_native_login_";
const NATIVE_AUTH_CALLBACK_URL = "com.thecoded.adhanhome://auth";
const APP_SESSION_PREFIX = "adhapp_";

function isNativeRuntime(): boolean {
  try {
    return !!Capacitor?.isNativePlatform?.();
  } catch {
    return false;
  }
}

function parseAuthParamsFromCurrentUrl() {
  if (typeof window === "undefined") {
    return {
      accessToken: null,
      code: null,
      state: null,
      scope: null,
      error: null,
      errorDescription: null,
    };
  }

  const searchParams = new URLSearchParams(window.location.search || "");
  const hashParams = new URLSearchParams((window.location.hash || "").replace(/^#/, ""));

  return {
    accessToken:
      hashParams.get("access_token") ||
      searchParams.get("access_token") ||
      searchParams.get("amazon_access_token"),
    code: searchParams.get("code") || hashParams.get("code"),
    state: searchParams.get("state") || hashParams.get("state"),
    scope: searchParams.get("scope") || hashParams.get("scope"),
    error: searchParams.get("error") || hashParams.get("error"),
    errorDescription:
      searchParams.get("error_description") || hashParams.get("error_description"),
  };
}

function buildAmazonLoginUrl(state: string): string {
  const url = new URL(AMAZON_AUTHORIZE_URL);
  url.searchParams.set("client_id", getAmazonClientId());
  url.searchParams.set("scope", "profile");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", getAmazonReturnUrl());
  url.searchParams.set("state", state);
  return url.toString();
}

function buildNativeAppCallbackUrl(params: {
  sessionToken?: string | null;
  userKey?: string | null;
  error?: string | null;
}) {
  const url = new URL(NATIVE_AUTH_CALLBACK_URL);

  if (params.sessionToken) {
    const sessionToken = params.sessionToken.trim();
    if (!sessionToken.startsWith(APP_SESSION_PREFIX)) {
      throw new Error("Cannot relay an invalid AdhanCast session token to Android.");
    }
    url.searchParams.set("session_token", sessionToken);
  }

  if (params.userKey) {
    url.searchParams.set("user_key", params.userKey);
  }

  if (params.error) {
    url.searchParams.set("error", params.error);
  }

  return url.toString();
}

function parseNativeAppCallbackUrl(rawUrl: string) {
  try {
    const url = new URL(rawUrl);

    if (url.protocol !== "com.thecoded.adhanhome:" || url.host !== "auth") {
      return null;
    }

    return {
      sessionToken: url.searchParams.get("session_token"),
      userKey: url.searchParams.get("user_key"),
      code: url.searchParams.get("code"),
      state: url.searchParams.get("state"),
      error: url.searchParams.get("error") || url.searchParams.get("error_description"),
    };
  } catch {
    return null;
  }
}

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
  return getAmazonReturnUrl();
}

export default function Step2ConnectAccounts({
  onboardingData,
  setOnboardingData,
}: Props) {
  const navigate = useNavigate();

  const [loadingKey, setLoadingKey] = useState<PlatformKey | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [deviceHint, setDeviceHint] = useState<string | null>(null);
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
      const resp = await apiFetchWithAmazonRepair("/api/integrations");
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
      const resp = await apiFetchWithAmazonRepair("/api/alexa/account-linking/status");
      if (!resp.ok) return;
      const data = (await resp.json()) as AlexaLinkStatus;
      setAlexaStatus(data);
    } catch {
      setAlexaStatus(null);
    }
  }

  async function completeAlexaLogin(
    accessToken: string
  ): Promise<{ data: IntegrationStatus; durableToken: string }> {
    const linkRes = await apiFetchWithAmazonRepair("/api/integrations/alexa/login", {
      method: "POST",
      body: JSON.stringify({ accessToken }),
    });

    if (!linkRes.ok) {
      const msg = await linkRes.text().catch(() => "");
      throw new Error(`Backend link failed (${linkRes.status}). ${msg}`.trim());
    }

    const data = (await linkRes.json().catch(() => ({}))) as IntegrationStatus & {
      accessToken?: string | null;
    };
    const durableToken =
      typeof data?.sessionToken === "string" && data.sessionToken.trim()
        ? data.sessionToken.trim()
        : accessToken;

    setStoredAmazonToken(durableToken);
    setTokens((prev) => ({ ...prev, alexa: durableToken }));
    markConnected("alexa");
    setServerStatus(data);
    setInfo("Amazon account connected. You can now enable the Alexa skill from this screen.");

    void refreshServerStatus();
    void refreshAlexaLinkStatus();

    return { data, durableToken };
  }

  async function completeAlexaLoginWithCode(
    code: string
  ): Promise<{ data: IntegrationStatus; durableToken: string }> {
    const linkRes = await apiFetchWithAmazonRepair("/api/integrations/alexa/login-code", {
      method: "POST",
      body: JSON.stringify({
        code,
        redirectUri: getAmazonReturnUrl(),
      }),
    });

    if (!linkRes.ok) {
      const msg = await linkRes.text().catch(() => "");
      console.error("[Step2] /login-code failed:", linkRes.status, msg);
      throw new Error(`Backend code exchange failed (${linkRes.status}). ${msg}`.trim());
    }

    const data = (await linkRes.json().catch(() => ({}))) as IntegrationStatus & {
      accessToken?: string | null;
    };

    const durableToken =
      typeof data?.sessionToken === "string" && data.sessionToken.trim()
        ? data.sessionToken.trim()
        : "";

    if (!durableToken) {
      throw new Error("Backend did not return an AdhanCast session token.");
    }

    if (!durableToken.startsWith(APP_SESSION_PREFIX)) {
      throw new Error("Backend returned an invalid AdhanCast session token.");
    }

    setStoredAmazonToken(durableToken);
    setTokens((prev) => ({ ...prev, alexa: durableToken }));
    markConnected("alexa");
    setServerStatus(data);
    setInfo("Amazon account connected. You can now enable the Alexa skill from this screen.");

    void refreshServerStatus();
    void refreshAlexaLinkStatus();

    return { data, durableToken };
  }

  async function handleNativeAppCallback(rawUrl: string): Promise<boolean> {
    const parsed = parseNativeAppCallbackUrl(rawUrl);
    if (!parsed) return false;

    try {
      await Browser.close();
    } catch {
      // Browser may already be closed.
    }

    if (parsed.error) {
      setError(parsed.error);
      setLoadingKey(null);
      return true;
    }

    if (parsed.code) {
      setError(
        "Android login returned an authorization code instead of a session token. Rebuild/deploy the Step 2 web callback so it exchanges the code first."
      );
      setLoadingKey(null);
      return true;
    }

    if (!parsed.sessionToken) {
      setError("Android login returned without a session token.");
      setLoadingKey(null);
      return true;
    }

    if (!parsed.sessionToken.startsWith(APP_SESSION_PREFIX)) {
      setError("Android login returned an invalid AdhanCast session token.");
      setLoadingKey(null);
      return true;
    }

    setStoredAmazonToken(parsed.sessionToken);
    setTokens((prev) => ({ ...prev, alexa: parsed.sessionToken || "" }));
    markConnected("alexa");
    setInfo("Amazon account connected in the Android app.");
    setLoadingKey(null);

    await Promise.all([refreshServerStatus(), refreshAlexaLinkStatus()]);
    return true;
  }

  async function finalizeAlexaSkillLink(code: string, state: string) {
    const pending = readPendingAlexaLink();
    if (!pending || pending.state !== state) {
      clearPendingAlexaLink();
      cleanCurrentUrl();
      throw new Error(
        "Alexa returned to the app, but the linking session could not be verified."
      );
    }

    cleanCurrentUrl();

    const resp = await apiFetchWithAmazonRepair("/api/alexa/account-linking/complete", {
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

    // Extract the real invocation name the backend uses so the hint is accurate.
    const completeData = await resp.json().catch(() => ({})) as { invocationName?: unknown };
    const invocationName =
      typeof completeData?.invocationName === "string" &&
      completeData.invocationName.trim()
        ? completeData.invocationName.trim()
        : "adhan cast";

    clearPendingAlexaLink();
    await Promise.all([refreshServerStatus(), refreshAlexaLinkStatus()]);
    setInfo("Alexa skill enabled and account linking completed.");
    setDeviceHint(
      `Devices appear in Step 5 after a linked Echo device talks to the skill once. ` +
      `Say: Alexa, open ${invocationName}. Then say: play Fajr adhan.`
    );
  }

  useEffect(() => {
    const boot = async () => {
      const authParams = parseAuthParamsFromCurrentUrl();
      const pendingAlexaLink = readPendingAlexaLink();

      try {
        if (authParams.error) {
          cleanCurrentUrl();

          if (authParams.state?.startsWith(NATIVE_LOGIN_STATE_PREFIX)) {
            window.location.replace(
              buildNativeAppCallbackUrl({
                error: authParams.errorDescription || authParams.error,
              })
            );
            return;
          }

          if (pendingAlexaLink?.state === authParams.state) {
            clearPendingAlexaLink();
          }

          setError(authParams.errorDescription || authParams.error);
          return;
        }

        if (authParams.code && authParams.state?.startsWith(NATIVE_LOGIN_STATE_PREFIX)) {
          setLoadingKey("alexa");
          setError(null);
          const result = await completeAlexaLoginWithCode(authParams.code);
          window.location.replace(
            buildNativeAppCallbackUrl({
              sessionToken: result.durableToken,
              userKey: result.data.userKey || null,
            })
          );
          return;
        }

        if (authParams.code && authParams.state?.startsWith(AMAZON_LOGIN_STATE_PREFIX)) {
          setLoadingKey("alexa");
          setError(null);
          await completeAlexaLoginWithCode(authParams.code);
          cleanCurrentUrl();
          return;
        }

        if (authParams.code && pendingAlexaLink?.state === authParams.state) {
          if (
            authParams.scope &&
            !authParams.scope.split(/\s+/).includes("alexa::skills:account_linking")
          ) {
            throw new Error(
              `Alexa returned the wrong scope (${authParams.scope}). The linking request must use alexa::skills:account_linking.`
            );
          }

          setLoadingKey("alexa");
          setError(null);
          await finalizeAlexaSkillLink(authParams.code, authParams.state || "");
          return;
        }

        if (authParams.accessToken) {
          setLoadingKey("alexa");
          setError(null);
          await completeAlexaLogin(authParams.accessToken);
          cleanCurrentUrl();
          return;
        }

        const restoredToken = restoreAmazonTokenFromUrl();
        if (restoredToken && !restoredToken.startsWith(APP_SESSION_PREFIX)) {
          // Only send raw Amazon access tokens to the old /login endpoint.
          // adhapp_ session tokens are AdhanCast app sessions — pass them
          // through refreshServerStatus instead of re-sending to Amazon.
          setLoadingKey("alexa");
          setError(null);
          await completeAlexaLogin(restoredToken);
        } else if (getStoredAmazonToken()) {
          markConnected("alexa");
          await Promise.all([refreshServerStatus(), refreshAlexaLinkStatus()]);
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Alexa connection failed.";
        console.error("[Step2] boot error:", msg, e);
        setError(msg);
      } finally {
        setLoadingKey(null);
        await Promise.all([refreshServerStatus(), refreshAlexaLinkStatus()]);
      }
    };

    void boot();
  }, []);

  useEffect(() => {
    if (!isNativeRuntime()) return;

    let removeListener: (() => void) | null = null;

    void CapacitorApp.addListener("appUrlOpen", ({ url }) => {
      if (!url) return;
      void handleNativeAppCallback(url);
    }).then((listener) => {
      removeListener = () => {
        void listener.remove();
      };
    });

    void CapacitorApp.getLaunchUrl().then((result) => {
      if (result?.url) {
        void handleNativeAppCallback(result.url);
      }
    });

    return () => {
      if (removeListener) removeListener();
    };
  }, []);

  async function connectAlexa() {
    setError(null);
    setInfo(null);
    setLoadingKey("alexa");

    try {
      const state = `${isNativeRuntime() ? NATIVE_LOGIN_STATE_PREFIX : AMAZON_LOGIN_STATE_PREFIX}${Date.now()}`;
      const authorizationUrl = buildAmazonLoginUrl(state);

      if (isNativeRuntime()) {
        setInfo(
          "Opening Amazon sign-in. After approval, AdhanCast will return to the app automatically."
        );
        await Browser.open({
          url: authorizationUrl,
          presentationStyle: "fullscreen",
        });
        setLoadingKey(null);
        return;
      }

      window.location.assign(authorizationUrl);
    } catch (e: unknown) {
      setLoadingKey(null);
      setError(e instanceof Error ? e.message : "Alexa connection failed.");
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

      const resp = await apiFetchWithAmazonRepair("/api/alexa/account-linking/start", {
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
      await apiFetchWithAmazonRepair("/api/integrations/alexa/disconnect", {
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
    <div className="min-h-screen bg-slate-950 overscroll-none">
      {/* Sticky Header */}
      <div
        className="sticky top-0 z-20 bg-slate-950/95 backdrop-blur-sm border-b border-slate-800/50"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <div className="max-w-7xl mx-auto px-4 py-4 md:px-6">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <Logo />
            <ProgressIndicator currentStep={2} totalSteps={6} />
          </div>
        </div>
      </div>

      <div
        className="max-w-4xl mx-auto px-4 py-8 md:py-12"
        style={{ paddingBottom: "calc(2rem + env(safe-area-inset-bottom))" }}
      >
        {/* Hero Section */}
        <div className="mb-8 md:mb-10">
          <h1 className="text-3xl md:text-4xl font-semibold text-white mb-3">
            Connect your account
          </h1>
          <p className="text-base text-slate-400 leading-relaxed">
            Sign in with Amazon &bull; Enable Alexa skill
          </p>
        </div>

        {/* Main Content Card */}
        <div className="rounded-3xl border border-slate-800/60 bg-slate-900/40 backdrop-blur-sm p-6 md:p-10">
          {/* Alerts */}
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

          {/* Platform Cards */}
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
                        className={`grid h-16 w-16 place-items-center rounded-xl flex-shrink-0 ${
                          linked
                            ? "bg-emerald-500/10 ring-2 ring-emerald-500/30"
                            : serverConnected
                            ? "bg-sky-500/10 ring-2 ring-sky-500/30"
                            : "bg-slate-800/60 ring-1 ring-slate-700/60"
                        }`}
                      >
                        <platform.Icon className="h-9 w-9" />
                      </div>

                      <div className="space-y-2.5 flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="font-semibold text-white text-lg">
                            {platform.name}
                          </div>
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

                        {/* Connection Status Indicators */}
                        {platform.key === "alexa" && serverConnected && (
                          <div className="flex flex-wrap items-center gap-3 pt-1">
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

                        {/* Technical Details — collapsible */}
                        {platform.key === "alexa" && serverConnected && (
                          <details className="text-xs text-slate-500 pt-1">
                            <summary className="cursor-pointer hover:text-slate-400 transition-colors font-medium select-none touch-manipulation">
                              Technical details
                            </summary>
                            <div className="mt-3 space-y-1.5 pl-3 border-l-2 border-slate-700/50">
                              <div className="flex items-center gap-2">
                                <span className="text-slate-400">App:</span>
                                <span className="text-slate-300">
                                  {serverConnected ? "Connected" : "Not connected"}
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-slate-400">Skill:</span>
                                <span className="text-slate-300">
                                  {linked
                                    ? "Linked"
                                    : alexaStatus?.enablementStatus ||
                                      serverStatus?.alexa?.skillStatus ||
                                      "Not linked"}
                                </span>
                              </div>
                              {alexaStatus?.invocationName && (
                                <div className="flex items-center gap-2">
                                  <span className="text-slate-400">Invocation:</span>
                                  <span className="text-slate-300">
                                    {alexaStatus.invocationName}
                                  </span>
                                </div>
                              )}
                            </div>
                          </details>
                        )}
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex flex-wrap items-center gap-3 md:flex-col md:items-stretch md:min-w-[160px]">
                      {platform.key === "alexa" ? (
                        !serverConnected ? (
                          <Button
                            onClick={() => void handleConnect(platform.key)}
                            disabled={busy}
                            className="flex-1 md:w-full bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white h-11 touch-manipulation active:opacity-90"
                          >
                            {busy ? "Connecting…" : "Sign in with Amazon"}
                          </Button>
                        ) : linked ? (
                          <>
                            <Button
                              variant="secondary"
                              disabled
                              className="flex-1 md:w-full h-11"
                            >
                              ✓ Connected
                            </Button>
                            <Button
                              onClick={() => void handleDisconnect(platform.key)}
                              disabled={busy}
                              variant="outline"
                              className="border-slate-700 text-slate-300 hover:bg-slate-800 h-11 touch-manipulation active:opacity-80"
                            >
                              {busy ? "Disconnecting…" : "Disconnect"}
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button
                              onClick={() => void handleConnect(platform.key)}
                              disabled={busy}
                              className="flex-1 md:w-full bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white h-11 touch-manipulation active:opacity-90"
                            >
                              {busy ? "Opening…" : "Enable Alexa skill"}
                            </Button>
                            <Button
                              onClick={() => void handleDisconnect(platform.key)}
                              disabled={busy}
                              variant="outline"
                              className="border-slate-700 text-slate-300 hover:bg-slate-800 text-sm h-11 touch-manipulation active:opacity-80"
                            >
                              {busy ? "Disconnecting…" : "Disconnect"}
                            </Button>
                          </>
                        )
                      ) : (
                        <Button
                          disabled
                          variant="secondary"
                          className="flex-1 md:w-full h-11"
                        >
                          Coming Soon
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Guidance Box */}
          <div className="mb-6 rounded-2xl border border-slate-700/50 bg-slate-800/30 p-6">
            <div className="flex items-start gap-4">
              <div className="rounded-lg bg-emerald-500/10 p-2.5 mt-0.5 flex-shrink-0">
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
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-white mb-3 text-base">Setup steps</div>
                <div className="space-y-2.5 text-sm text-slate-300 leading-relaxed">
                  <div className="flex items-start gap-2">
                    <span className="text-emerald-400 font-bold mt-0.5">1.</span>
                    <span>Sign in with your Amazon account</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-emerald-400 font-bold mt-0.5">2.</span>
                    <span>Enable the Alexa skill</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-emerald-400 font-bold mt-0.5">3.</span>
                    <span>Configure prayer times and devices</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Device Hint — shown after skill linking */}
          {(deviceHint || skillLinked) && (
            <div className="mb-6 rounded-2xl border border-sky-500/20 bg-sky-500/5 p-4 text-sm text-sky-100">
              {deviceHint ||
                "After linking, use the skill once from each Alexa device you want to appear in Step 5. Saying 'Alexa, open AdhanCast' and then 'play Fajr adhan' is enough."}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-3">
            <Button
              variant="outline"
              onClick={() => navigate("/onboarding/step1")}
              className="flex-1 border-slate-700 text-slate-300 hover:bg-slate-800 h-11 touch-manipulation active:bg-slate-800"
            >
              Back
            </Button>

            <Button
              onClick={handleContinue}
              disabled={!continueEnabled}
              className="flex-1 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white h-11 font-medium disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation active:opacity-90"
            >
              {continueEnabled ? "Continue to location" : "Connect Amazon to continue"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
