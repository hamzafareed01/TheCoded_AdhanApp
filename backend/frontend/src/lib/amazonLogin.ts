declare global {
  interface Window {
    amazon?: any;
    onAmazonLoginReady?: () => void;
  }
}

let sdkLoaded = false;
let loadingPromise: Promise<void> | null = null;

const AMAZON_CLIENT_ID_FALLBACK =
  "amzn1.application-oa2-client.383c219cb1ca42fdbd844e17e11aa843";

const AMAZON_RETURN_URL_FALLBACK =
  "https://nice-ground-009684610.1.azurestaticapps.net/onboarding/step2";

function normalizeEnvString(value: unknown): string {
  const v = String(value ?? "").trim();
  if (!v) return "";
  if (v === "undefined" || v === "null") return "";
  return v;
}

function normalizeAbsoluteUrl(value: unknown): string {
  const raw = normalizeEnvString(value);
  if (!raw) return "";

  try {
    const url = new URL(raw);
    url.hash = "";
    return url.toString();
  } catch {
    return "";
  }
}

function normalizeRedirectUrl(value: unknown): string {
  const absolute = normalizeAbsoluteUrl(value);
  if (!absolute) return "";

  const url = new URL(absolute);
  url.hash = "";
  url.pathname = url.pathname.replace(/\/+$/, "") || "/";
  return `${url.origin}${url.pathname}${url.search}`;
}

function getBrowserDefaultReturnUrl(): string {
  if (typeof window === "undefined") return AMAZON_RETURN_URL_FALLBACK;
  return normalizeRedirectUrl(`${window.location.origin}/onboarding/step2`);
}

export function getAmazonClientId(): string {
  const envClientId = normalizeEnvString(
    (import.meta as any).env?.VITE_AMAZON_CLIENT_ID ||
    (import.meta as any).env?.VITE_LWA_CLIENT_ID
  );

  return envClientId || AMAZON_CLIENT_ID_FALLBACK;
}

export function getAmazonReturnUrl(): string {
  const envReturnUrl = normalizeRedirectUrl(
    (import.meta as any).env?.VITE_AMAZON_RETURN_URL ||
    (import.meta as any).env?.VITE_AMAZON_REDIRECT_URI
  );

  return envReturnUrl || getBrowserDefaultReturnUrl() || AMAZON_RETURN_URL_FALLBACK;
}

export function ensureAmazonSdk(): Promise<void> {
  if (sdkLoaded && window.amazon?.Login) {
    return Promise.resolve();
  }

  if (window.amazon?.Login) {
    const clientId = getAmazonClientId();
    if (!clientId) {
      return Promise.reject(new Error("Amazon Client ID is missing"));
    }

    window.amazon.Login.setClientId(clientId);
    sdkLoaded = true;
    return Promise.resolve();
  }

  if (loadingPromise) return loadingPromise;

  loadingPromise = new Promise<void>((resolve, reject) => {
    let timeoutId: number | null = window.setTimeout(() => {
      loadingPromise = null;
      reject(new Error("Amazon SDK did not finish loading in time"));
    }, 15000);

    window.onAmazonLoginReady = function () {
      try {
        if (!window.amazon?.Login) {
          throw new Error("Amazon SDK did not initialise correctly");
        }

        const clientId = getAmazonClientId();
        if (!clientId) {
          throw new Error("Amazon Client ID is missing");
        }

        window.amazon.Login.setClientId(clientId);

        sdkLoaded = true;
        loadingPromise = null;
        if (timeoutId !== null) {
          window.clearTimeout(timeoutId);
          timeoutId = null;
        }
        resolve();
      } catch (err) {
        loadingPromise = null;
        if (timeoutId !== null) {
          window.clearTimeout(timeoutId);
          timeoutId = null;
        }
        reject(err);
      }
    };

    const existing = document.getElementById("amazon-login-sdk") as HTMLScriptElement | null;
    if (existing) {
      if (window.amazon?.Login) {
        window.onAmazonLoginReady?.();
      }
      return;
    }

    const root = document.getElementById("amazon-root") || document.body;
    const script = document.createElement("script");
    script.type = "text/javascript";
    script.async = true;
    script.id = "amazon-login-sdk";
    script.src = "https://assets.loginwithamazon.com/sdk/na/login1.js";
    script.onerror = (err) => {
      loadingPromise = null;
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
        timeoutId = null;
      }
      reject(err as any);
    };

    root.appendChild(script);
  });

  return loadingPromise;
}

export { };
