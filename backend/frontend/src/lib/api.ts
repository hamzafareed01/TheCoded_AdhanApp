// src/lib/api.ts

const API_BASE =
  (import.meta as any).env?.VITE_API_BASE_URL ||
  "http://localhost:4000";

// Generic API fetch helper
export async function apiFetch<T = any>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const url =
    path.startsWith("http")
      ? path
      : `${API_BASE}${path.startsWith("/") ? "" : "/"}${path}`;

  const headers = {
    ...(init.headers || {}),
  };

  const res = await fetch(url, {
    ...init,
    headers,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Request failed: ${res.status}`);
  }

  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    return (await res.json()) as T;
  }
  return (await res.text()) as unknown as T;
}
