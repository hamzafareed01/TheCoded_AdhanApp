// backend/frontend/src/lib/api.ts

// IMPORTANT:
// - In production (SWA), we set VITE_API_BASE to your Azure backend URL.
// - In local dev / preview without env var, we use SAME-ORIGIN relative URLs like /api/health
//   so it works from phone/laptop as long as the host serves the backend.

const API_BASE = (import.meta.env.VITE_API_BASE || "").replace(/\/+$/, "");

export async function health() {
  const r = await fetch(apiUrl("/api/health"), { credentials: "include" });
  return r.json();
}

export function apiUrl(path: string) {
  // allow absolute URLs if you ever pass one
  if (path.startsWith("http://") || path.startsWith("https://")) return path;

  const cleanPath = path.startsWith("/") ? path : `/${path}`;

  // If VITE_API_BASE is set, call that host. Otherwise call relative to current host.
  return API_BASE ? `${API_BASE}${cleanPath}` : cleanPath;
}

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const url = apiUrl(path);
  return fetch(url, {
    ...init,
    credentials: init.credentials ?? "include",
  });
}