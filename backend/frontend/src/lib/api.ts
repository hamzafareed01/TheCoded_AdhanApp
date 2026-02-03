// const duas = require("./data/duas.json");

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";

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