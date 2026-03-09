// src/lib/amazonLogin.ts

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

export function getAmazonClientId(): string {
  const envClientId = normalizeEnvString(
    (import.meta as any).env?.VITE_AMAZON_CLIENT_ID ||
      (import.meta as any).env?.VITE_LWA_CLIENT_ID
  );

  return envClientId || AMAZON_CLIENT_ID_FALLBACK;
}

export function getAmazonReturnUrl(): string {
  const envReturnUrl = normalizeEnvString(
    (import.meta as any).env?.VITE_AMAZON_RETURN_URL ||
      (import.meta as any).env?.VITE_AMAZON_REDIRECT_URI
  );

  return envReturnUrl || AMAZON_RETURN_URL_FALLBACK;
}

export function ensureAmazonSdk(): Promise<void> {
  if (sdkLoaded && window.amazon?.Login) {
    return Promise.resolve();
  }

  if (loadingPromise) return loadingPromise;

  loadingPromise = new Promise<void>((resolve, reject) => {
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
        resolve();
      } catch (err) {
        loadingPromise = null;
        reject(err);
      }
    };

    const existing = document.getElementById("amazon-login-sdk");
    if (existing) {
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
      reject(err as any);
    };

    root.appendChild(script);
  });

  return loadingPromise;
}

export {};