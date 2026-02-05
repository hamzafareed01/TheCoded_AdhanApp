// const duas = require("./data/duas.json");


const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8080";

export async function health() {
  const r = await fetch(`${API_BASE}/api/health`, { credentials: "include" });
  return r.json();
}

export function apiUrl(path: string) {
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  const cleanBase = API_BASE.replace(/\/+$/, "");
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `${cleanBase}${cleanPath}`;
}

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const url = apiUrl(path);
  return fetch(url, {
    ...init,
    // Safe for now; helps later if you add cookie/session auth
    credentials: init.credentials ?? "include",
  });
}