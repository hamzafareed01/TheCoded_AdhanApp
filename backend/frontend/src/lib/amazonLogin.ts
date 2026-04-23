import { Capacitor } from "@capacitor/core";

const AMAZON_SDK_SRC = "https://assets.loginwithamazon.com/sdk/na/login1.js";

type AmazonAuthorizeResponse = {
  access_token?: string;
  token_type?: string;
  expires_in?: number | string;
  scope?: string;
  state?: string;
  error?: string;
  error_description?: string;
};

type AmazonAuthorizeOptions = {
  scope?: string;
  state?: string;
  popup?: boolean;
  responseType?: "token";
};

type AmazonLoginNamespace = {
  setClientId: (clientId: string) => void;
  authorize: (
    options: Record<string, unknown>,
    callback?: (response: AmazonAuthorizeResponse) => void
  ) => void;
  logout?: () => void;
};

type ParsedAuthReturn = {
  url: URL;
  path: string;
  accessToken: string | null;
  code: string | null;
  state: string | null;
  scope: string | null;
  error: string | null;
  errorDescription: string | null;
};

declare global {
  interface Window {
    amazon?: {
      Login?: AmazonLoginNamespace;
    };
  }
}

const PROD_STEP2_URL =
  "https://nice-ground-009684610.1.azurestaticapps.net/onboarding/step2";

const AMAZON_RETURN_URL_FALLBACK = PROD_STEP2_URL;

const ALLOWED_RETURN_ORIGINS = new Set([
  "https://nice-ground-009684610.1.azurestaticapps.net",
  "https://nice-ground-009684610-1.centralus.1.azurestaticapps.net",
  "http://localhost:5173"
]);

let sdkLoadPromise: Promise<void> | null = null;

function normalizeUrl(value: string): string {
  const raw = String(value || "").trim();
  if (!raw) return "";

  try {
    const url = new URL(raw);
    url.hash = "";
    return url.toString();
  } catch {
    return "";
  }
}

function normalizeOrigin(value: string): string {
  const raw = String(value || "").trim();
  if (!raw) return "";

  try {
    return new URL(raw).origin;
  } catch {
    return "";
  }
}

function getEnv(name: string): string {
  return String(import.meta.env?.[name] || "").trim();
}

function isNativeRuntime(): boolean {
  try {
    return !!Capacitor?.isNativePlatform?.();
  } catch {
    return false;
  }
}

export function isAmazonNativeRuntime(): boolean {
  return isNativeRuntime();
}

function getPreferredClientIdCandidates(): string[] {
  return [
    getEnv("VITE_AMAZON_APP_LINK_CLIENT_ID"),
    getEnv("VITE_AMAZON_CLIENT_ID")
  ].filter(Boolean);
}

export function getAmazonClientId(): string {
  const clientId = getPreferredClientIdCandidates()[0] || "";
  if (!clientId) {
    throw new Error(
      "Amazon app-login client ID is missing. Set VITE_AMAZON_APP_LINK_CLIENT_ID or VITE_AMAZON_CLIENT_ID."
    );
  }
  return clientId;
}

export function getAmazonReturnUrl(): string {
  const explicit = normalizeUrl(getEnv("VITE_AMAZON_NATIVE_RETURN_URL")) ||
    normalizeUrl(getEnv("VITE_AMAZON_RETURN_URL")) ||
    normalizeUrl(getEnv("VITE_AMAZON_REDIRECT_URI"));

  if (explicit) {
    const origin = normalizeOrigin(explicit);
    if (!ALLOWED_RETURN_ORIGINS.has(origin)) {
      throw new Error(
        `Amazon return URL origin is not allowed: ${origin || explicit}`
      );
    }
    return explicit;
  }

  return AMAZON_RETURN_URL_FALLBACK;
}

export function getAmazonScope(): string {
  return "profile";
}

function ensureAmazonNamespace(): AmazonLoginNamespace {
  const login = window.amazon?.Login;
  if (!login) {
    throw new Error("Amazon Login SDK loaded, but window.amazon.Login is unavailable.");
  }
  return login;
}

export async function loadAmazonSdk(): Promise<void> {
  if (typeof window === "undefined") {
    throw new Error("Amazon Login SDK can only load in the browser.");
  }

  if (window.amazon?.Login) {
    window.amazon.Login.setClientId(getAmazonClientId());
    return;
  }

  if (sdkLoadPromise) {
    await sdkLoadPromise;
    return;
  }

  sdkLoadPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${AMAZON_SDK_SRC}"]`
    );

    if (existing) {
      existing.addEventListener("load", () => {
        try {
          const login = ensureAmazonNamespace();
          login.setClientId(getAmazonClientId());
          resolve();
        } catch (err) {
          reject(err);
        }
      });

      existing.addEventListener("error", () => {
        reject(new Error("Failed to load Amazon Login SDK."));
      });

      return;
    }

    const script = document.createElement("script");
    script.src = AMAZON_SDK_SRC;
    script.async = true;

    script.onload = () => {
      try {
        const login = ensureAmazonNamespace();
        login.setClientId(getAmazonClientId());
        resolve();
      } catch (err) {
        reject(err);
      }
    };

    script.onerror = () => {
      reject(new Error("Failed to load Amazon Login SDK."));
    };

    document.head.appendChild(script);
  });

  await sdkLoadPromise;
}

export const ensureAmazonSdk = loadAmazonSdk;

export function buildAmazonAuthorizeOptions(
  options: AmazonAuthorizeOptions = {}
): Record<string, unknown> {
  const popup = options.popup ?? !isNativeRuntime();
  const returnUrl = getAmazonReturnUrl();

  const authorizeOptions: Record<string, unknown> = {
    client_id: getAmazonClientId(),
    scope: options.scope || getAmazonScope(),
    response_type: options.responseType || "token",
    popup
  };

  if (options.state) {
    authorizeOptions.state = options.state;
  }

  if (!popup) {
    authorizeOptions.next = returnUrl;
  }

  return authorizeOptions;
}

export async function authorizeWithAmazon(
  options: AmazonAuthorizeOptions = {}
): Promise<AmazonAuthorizeResponse> {
  const isNative = isNativeRuntime();
  const usePopup = options.popup ?? !isNative;

  // For native platforms, avoid the JS SDK's 'authorize' method which can cause WebView crashes
  // or issues with window management. Instead, use a direct window navigation.
  if (isNative && !usePopup) {
    const clientId = getAmazonClientId();
    const returnUrl = getAmazonReturnUrl();
    const scope = options.scope || getAmazonScope();
    const state = options.state || `adhan_${Date.now()}`;
    const responseType = options.responseType || "token";

    // Use na.account.amazon.com directly for North America, or www.amazon.com
    const authUrl = new URL("https://www.amazon.com/ap/oa");
    authUrl.searchParams.set("client_id", clientId);
    authUrl.searchParams.set("scope", scope);
    authUrl.searchParams.set("response_type", responseType);
    authUrl.searchParams.set("redirect_uri", returnUrl);
    authUrl.searchParams.set("state", state);

    console.log("Navigating to Amazon Auth URL:", authUrl.toString());
    window.location.assign(authUrl.toString());

    // Return a promise that never resolves as the page is navigating away
    return new Promise<AmazonAuthorizeResponse>(() => {});
  }

  // Only load the SDK if we are on Web/Popup flow to avoid crashes on Native
  await loadAmazonSdk();

  const login = ensureAmazonNamespace();
  const authorizeOptions = buildAmazonAuthorizeOptions(options);

  return new Promise<AmazonAuthorizeResponse>((resolve, reject) => {
    try {
      login.authorize(authorizeOptions, (response: AmazonAuthorizeResponse) => {
        if (!response) {
          reject(new Error("Amazon authorization returned an empty response."));
          return;
        }

        if (response.error) {
          reject(
            new Error(
              response.error_description ||
                response.error ||
                "Amazon authorization failed."
            )
          );
          return;
        }

        if (!response.access_token) {
          reject(new Error("Amazon authorization did not return an access token."));
          return;
        }

        resolve(response);
      });
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });
}

export async function connectAmazonInteractive(
  state?: string
): Promise<AmazonAuthorizeResponse> {
  return authorizeWithAmazon({
    state,
    popup: !isNativeRuntime(),
    responseType: "token",
    scope: "profile"
  });
}

export function logoutAmazon(): void {
  try {
    window.amazon?.Login?.logout?.();
  } catch {
    // no-op
  }
}

export function parseAuthReturnUrl(rawUrl: string): ParsedAuthReturn | null {
  try {
    const url = new URL(rawUrl);
    return {
      url,
      path: url.pathname,
      accessToken:
        url.hash ? new URLSearchParams(url.hash.replace(/^#/, "")).get("access_token") : null,
      code: url.searchParams.get("code"),
      state: url.searchParams.get("state"),
      scope: url.searchParams.get("scope"),
      error: url.searchParams.get("error"),
      errorDescription: url.searchParams.get("error_description")
    };
  } catch {
    return null;
  }
}

export function isStep2CallbackPath(path: string): boolean {
  return path === "/onboarding/step2" || path === "/alexa/link";
}