// amazonLogin.ts
// Browser/PWA-only Login with Amazon helper for AdhanCast.
// This restores the stable pre-Android baseline so Step 2 works on web first.

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

declare global {
  interface Window {
    amazon?: {
      Login?: AmazonLoginNamespace;
    };
  }
}

const AMAZON_SDK_SRC = "https://assets.loginwithamazon.com/sdk/na/login1.js";
const AMAZON_CLIENT_ID_FALLBACK =
  "amzn1.application-oa2-client.383c219cb1ca42fdbd844e17e11aa843";
const PROD_STEP2_URL =
  "https://nice-ground-009684610.1.azurestaticapps.net/onboarding/step2";

const ALLOWED_RETURN_ORIGINS = new Set([
  "https://nice-ground-009684610.1.azurestaticapps.net",
  "https://nice-ground-009684610-1.centralus.1.azurestaticapps.net",
  "http://localhost:5173",
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
  return String((import.meta as any).env?.[name] || "").trim();
}

export function getAmazonClientId(): string {
  return (
    getEnv("VITE_AMAZON_CLIENT_ID") ||
    getEnv("VITE_AMAZON_APP_LINK_CLIENT_ID") ||
    AMAZON_CLIENT_ID_FALLBACK
  );
}

export function getAmazonReturnUrl(): string {
  const explicit =
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

  if (typeof window !== "undefined") {
    const currentOrigin = normalizeOrigin(window.location.origin);
    if (ALLOWED_RETURN_ORIGINS.has(currentOrigin)) {
      return `${currentOrigin}/onboarding/step2`;
    }
  }

  return PROD_STEP2_URL;
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
  const returnUrl = getAmazonReturnUrl();
  const popup = options.popup ?? false;

  const authorizeOptions: Record<string, unknown> = {
    client_id: getAmazonClientId(),
    scope: options.scope || getAmazonScope(),
    response_type: options.responseType || "token",
    popup,
    redirect_uri: returnUrl,
    return_url: returnUrl,
  };

  if (options.state) {
    authorizeOptions.state = options.state;
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
    popup: false,
    responseType: "token",
    scope: "profile",
  });
}

export function logoutAmazon(): void {
  try {
    window.amazon?.Login?.logout?.();
  } catch {
    // no-op
  }
}
