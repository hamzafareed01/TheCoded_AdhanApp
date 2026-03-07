// src/lib/api.ts

function normalizeBase(base: string): string {
  const b = (base || "").trim();
  if (!b) return "";
  return b.replace(/\/+$/, "");
}

/**
 * Production safety:
 * - Prefer env var always (VITE_API_BASE or VITE_API_BASE_URL).
 * - If deployed on Azure Static Web Apps and env is missing, use a real backend fallback.
 *   (This is not mock data; it's a safe production fallback.)
 */
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

export const API_BASE =
  normalizeBase(envBase) || (!isLocal && isAzureStaticApps ? FALLBACK_PROD_API : "");

export function getApiUrl(path: string): string {
  if (!path) return API_BASE || "";
  if (/^https?:\/\//i.test(path)) return path;
  if (!API_BASE) return path; // local dev can proxy if you want
  return `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
}

export async function apiFetch(path: string, init: RequestInit = {}) {
  const url = getApiUrl(path);
  const headers = new Headers(init.headers || {});

  // default accept json
  if (!headers.has("Accept")) headers.set("Accept", "application/json");

  // Auto JSON header if sending a JSON body
  if (
    init.body &&
    !(init.body instanceof FormData) &&
    !headers.has("Content-Type")
  ) {
    headers.set("Content-Type", "application/json");
  }

  // Auto attach Amazon token if present
  if (!headers.has("Authorization") && isBrowser) {
    const token = localStorage.getItem("amazon_access_token");
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }

  // IMPORTANT: do NOT force credentials: "include" for cross-origin APIs.
  // That can break CORS unless backend is configured for credentials.
  const credentials = init.credentials ?? "omit";

  return fetch(url, {
    ...init,
    headers,
    credentials,
    mode: "cors",
  });
}