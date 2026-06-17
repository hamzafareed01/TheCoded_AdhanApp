// lib/offlineCache.ts
//
// Generic network-first cache for small API responses (settings, hadith, etc.)
// so the UI degrades gracefully offline instead of erroring. Mirrors the safe,
// localStorage-backed approach used by prayerCache. Never throws into the UI.

const VERSION = "v1";
const PREFIX = `adhan_oc_${VERSION}_`;

type CacheRecord<T> = {
  cachedAt: number;
  payload: T;
};

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore quota / private-mode errors
  }
}

/** Store any JSON-serialisable value under a namespaced key. */
export function cacheValue<T>(key: string, payload: T): void {
  const record: CacheRecord<T> = { cachedAt: Date.now(), payload };
  safeSet(`${PREFIX}${key}`, JSON.stringify(record));
}

/**
 * Read a cached value. If maxAgeMs is provided and the entry is older, returns
 * null (caller falls back to its normal error path).
 */
export function readValue<T>(key: string, maxAgeMs?: number): T | null {
  const raw = safeGet(`${PREFIX}${key}`);
  if (!raw) return null;
  try {
    const record = JSON.parse(raw) as CacheRecord<T>;
    if (maxAgeMs && Date.now() - record.cachedAt > maxAgeMs) return null;
    return record.payload;
  } catch {
    return null;
  }
}
