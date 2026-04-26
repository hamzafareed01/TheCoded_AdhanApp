// Capacitor/native platform support removed — web/PWA only

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
  responseType?: "code" | "token";
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

// No native runtime in web-only build
function isNativeRuntime(): boolean {
  return false;
}

export function isAmazonNativeRuntime(): boolean {
  return false;
}

function getPreferredClientIdCandidates(): string[] {
  return [getEnv("VITE_AMAZON_CLIENT_ID")].filter(Boolean);
}

export function getAmazonClientId(): string {
  const clientId = getPreferredClientIdCandidates()[0] || "";
  if (!clientId) {
    throw new Error(
      "Amazon client ID is missing. Set VITE_AMAZON_CLIENT_ID."
    );
  }
  return clientId;
}

export function getAmazonReturnUrl(): string {
  const explicit =
    normalizeUrl(getEnv("VITE_AMAZON_RETURN_URL")) ||
    normalizeUrl(getEnv("VITE_AMAZON_REDIRECT_URI"));

  if (explicit) {
    const origin = normalizeOrigin(explicit);
    if (!ALLOWED_RETURN_ORIGINS.has(origin)) {
      throw new Error(`Amazon return URL origin is not allowed: ${origin || explicit}`);
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
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${AMAZON_SDK_SRC}"]`);

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
    response_type: options.responseType || "code",
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
    responseType: "code",
    scope: "profile"
  });
}

export function logoutAmazon(): void {
  if (isNativeRuntime()) return;
  try {
    window.amazon?.Login?.logout?.();
  } catch {
    // no-op
  }
}

export function parseAuthReturnUrl(rawUrl: string): ParsedAuthReturn | null {
  console.log("parseAuthReturnUrl: Processing URL:", rawUrl);
  try {
    const url = new URL(rawUrl);

    // Support custom scheme or App Link
    let path = url.pathname;
    if (url.protocol === "com.thecoded.adhanhome:") {
      // For com.thecoded.adhanhome://onboarding/step2
      // URL constructor: host = "onboarding", pathname = "/step2"
      if (url.host && url.host !== "localhost") {
        path = "/" + url.host + url.pathname;
      }
    }

    // Normalize path: remove trailing slashes and ensure leading slash
    path = path.replace(/\/+$/, "");
    if (!path.startsWith("/")) {
      path = "/" + path;
    }

    const hashParams = new URLSearchParams(url.hash.replace(/^#/, ""));
    const accessToken = hashParams.get("access_token");
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");

    console.log("parseAuthReturnUrl: Parsed components:", {
      path,
      hasAccessToken: !!accessToken,
      hasCode: !!code,
      state
    });

    return {
      url,
      path,
      accessToken,
      code,
      state,
      scope: url.searchParams.get("scope"),
      error: url.searchParams.get("error"),
      errorDescription: url.searchParams.get("error_description")
    };
  } catch (err) {
    console.error("parseAuthReturnUrl: Failed to parse URL:", err);
    return null;
  }
}

export function isStep2CallbackPath(path: string): boolean {
  const normalized = path.replace(/\/+$/, "");
  return normalized === "/onboarding/step2" || normalized === "/alexa/link";
}