// amazonLogin.ts
// Production-safe Login with Amazon helper for AdhanCast
// Goals:
// - no bad hardcoded Azure fallback host
// - strict env validation
// - popup-first auth to avoid the "next must be redirect URI if !options.popup" error
// - consistent redirect URI handling across prod and localhost

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

declare global {
  interface Window {
    amazon?: {
      Login?: AmazonLoginNamespace;
    };
  }

  interface ImportMeta {
    env: Record<string, string | undefined>;
  }
}

const PROD_STEP2_URL =
  "https://nice-ground-009684610.1.azurestaticapps.net/onboarding/step2";

const ALLOWED_RETURN_ORIGINS = new Set([
  "https://nice-ground-009684610.1.azurestaticapps.net",
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
  return String(import.meta.env?.[name] || "").trim();
}

export function getAmazonClientId(): string {
  const clientId = getEnv("VITE_AMAZON_CLIENT_ID");
  if (!clientId) {
    throw new Error(
      "VITE_AMAZON_CLIENT_ID is missing. Set it in Azure Static Web Apps and local .env."
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

  // Final safe fallback: only the correct production URL
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

export function buildAmazonAuthorizeOptions(
  options: AmazonAuthorizeOptions = {}
): Record<string, unknown> {
  const popup = options.popup ?? true;
  const returnUrl = getAmazonReturnUrl();

  const authorizeOptions: Record<string, unknown> = {
    client_id: getAmazonClientId(),
    scope: options.scope || getAmazonScope(),
    response_type: options.responseType || "token",
    popup,
    return_url: returnUrl,
  };

  if (options.state) {
    authorizeOptions.state = options.state;
  }

  // Only required when popup is false.
  // This avoids the exact SDK error you were seeing.
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
    popup: true,
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