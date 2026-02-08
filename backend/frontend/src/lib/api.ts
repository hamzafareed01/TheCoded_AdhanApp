// frontend/src/lib/api.ts

const API_BASE = (
  import.meta.env.VITE_API_BASE_URL ||
  import.meta.env.VITE_API_BASE ||
  ""
).replace(/\/+$/, "");

export function apiUrl(path: string) {
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return API_BASE ? `${API_BASE}${cleanPath}` : cleanPath;
}

export async function apiFetch(path: string, init: RequestInit = {}) {
  const url = apiUrl(path);
  return fetch(url, {
    ...init,
    credentials: init.credentials ?? "include",
  });
}

export async function health() {
  const r = await apiFetch("/api/health");
  return r.json();
}
