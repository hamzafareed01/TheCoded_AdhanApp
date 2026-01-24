// frontend/src/lib/api.ts
// Single source of truth for the backend base URL.
// - In dev, prefer Vite proxy + relative URLs (API_BASE empty)
// - In prod, set VITE_API_BASE_URL to your deployed backend (e.g., https://api.example.com)

const envAny: any = (import.meta as any).env || {};

// Back-compat: support both VITE_API_BASE_URL (preferred) and older VITE_API_BASE
const RAW_BASE: string =
  (envAny.VITE_API_BASE_URL as string) ||
  (envAny.VITE_API_BASE as string) ||
  "";

export const API_BASE = String(RAW_BASE || "").replace(/\/+$/, "");

export function apiUrl(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return API_BASE ? `${API_BASE}${p}` : p;
}

export async function apiFetch(path: string, init: RequestInit = {}) {
  const url = apiUrl(path);
  const headers = new Headers(init.headers || {});
  if (!headers.has("Content-Type") && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  return fetch(url, { ...init, headers });
}
