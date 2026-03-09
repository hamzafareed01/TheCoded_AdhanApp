// src/lib/api.ts

function normalizeBase(base: string): string {
  const b = (base || "").trim();
  if (!b) return "";
  return b.replace(/\/+$/, "");
}

const FALLBACK_PROD_API =
  "https://app-adhanhome-api-prod-cdfdcsfeb5gtd7e9.centralus-01.azurewebsites.net";

const envBase =
  (import.meta as any).env?.VITE_API_BASE ||
  (import.meta as any).env?.VITE_API_BASE_URL ||
  "";

const isBrowser = typeof window !== "undefined";
const host = isBrowser ? window.location.hostname : "";
const isLocal = host === "localhost" || host === "127.0.0.1";
const isAzureStaticApps = host.endsWith("azurestaticapps.net");

const TOKEN_KEY = "amazon_access_token";
const AUTH_EVENT = "amazon-auth-changed";

export const API_BASE =
  normalizeBase(envBase) || (!isLocal && isAzureStaticApps ? FALLBACK_PROD_API : "");

export function getApiUrl(path: string): string {
  if (!path) return API_BASE || "";
  if (/^https?:\/\//i.test(path)) return path;
  if (!API_BASE) return path;
  return `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
}

export const apiUrl = getApiUrl;

export function getStoredAmazonToken(): string | null {
  if (!isBrowser) return null;
  return (
    localStorage.getItem(TOKEN_KEY) ||
    sessionStorage.getItem(TOKEN_KEY) ||
    null
  );
}

export function setStoredAmazonToken(token: string) {
  if (!isBrowser) return;
  localStorage.setItem(TOKEN_KEY, token);
  sessionStorage.setItem(TOKEN_KEY, token);
  window.dispatchEvent(new Event(AUTH_EVENT));
}

export function clearStoredAmazonToken() {
  if (!isBrowser) return;
  localStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
  window.dispatchEvent(new Event(AUTH_EVENT));
}

export function subscribeToAmazonAuthChanges(callback: () => void) {
  if (!isBrowser) return () => {};

  const handler = () => callback();
  window.addEventListener(AUTH_EVENT, handler);
  window.addEventListener("storage", handler);
  window.addEventListener("focus", handler);

  return () => {
    window.removeEventListener(AUTH_EVENT, handler);
    window.removeEventListener("storage", handler);
    window.removeEventListener("focus", handler);
  };
}

export async function apiFetch(path: string, init: RequestInit = {}) {
  const url = getApiUrl(path);
  const headers = new Headers(init.headers || {});

  if (!headers.has("Accept")) headers.set("Accept", "application/json");

  if (
    init.body &&
    !(init.body instanceof FormData) &&
    !headers.has("Content-Type")
  ) {
    headers.set("Content-Type", "application/json");
  }

  if (!headers.has("Authorization")) {
    const token = getStoredAmazonToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }

  const credentials = init.credentials ?? "omit";

  return fetch(url, {
    ...init,
    headers,
    credentials,
    mode: "cors",
  });
}
