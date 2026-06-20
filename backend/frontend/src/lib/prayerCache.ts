// lib/prayerCache.ts
//
// Offline cache for prayer-times API responses.
//
// Policy: NETWORK-FIRST. Callers fetch live data when online (which carries the
// server's authoritative times, including mosque iqamah overrides and minute
// offsets) and fall back to this cache when the request fails (offline / flaky).
//
// Because this stores the server's own responses verbatim, offline times are an
// EXACT match for what the user last saw online — no recalculation, no drift.
//
// Storage: localStorage (prayer payloads are a few KB; synchronous + simple).
// All access is wrapped in try/catch so private-mode or quota errors never throw
// into the UI.

const VERSION = "v1";
const TODAY_KEY = `adhan_cache_today_${VERSION}`;
const MONTH_PREFIX = `adhan_cache_month_${VERSION}_`;
const MAX_MONTHS = 4; // keep the most recently used N months

type TodayRecord<T> = {
  cachedAt: number;
  dateIso: string; // the local calendar date this payload represents
  payload: T;
};

type MonthRecord<T> = {
  cachedAt: number;
  month: string; // YYYY-MM
  payload: T;
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

/** Local (not UTC) calendar date — matches how the app keys "today". */
export function localISODate(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

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

function safeRemove(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

// ── Today ─────────────────────────────────────────────────────────────────────

/** Cache a /api/prayer-times/today response for the current local date. */
export function cacheToday<T>(payload: T): void {
  const record: TodayRecord<T> = {
    cachedAt: Date.now(),
    dateIso: localISODate(),
    payload,
  };
  safeSet(TODAY_KEY, JSON.stringify(record));
}

/**
 * Read cached "today" — only returns it if it represents the actual current
 * local date (a cached payload from yesterday is a different day's times and
 * must not be shown). Returns null when absent or stale.
 */
export function readToday<T>(): T | null {
  const raw = safeGet(TODAY_KEY);
  if (!raw) return null;
  try {
    const record = JSON.parse(raw) as TodayRecord<T>;
    if (record.dateIso !== localISODate()) return null; // stale — different day
    return record.payload;
  } catch {
    return null;
  }
}

// ── Month ─────────────────────────────────────────────────────────────────────

function monthKeyOf(monthIso: string) {
  return `${MONTH_PREFIX}${monthIso}`;
}

/** Cache a /api/prayer-times/month response, pruning to the newest MAX_MONTHS. */
export function cacheMonth<T>(monthIso: string, payload: T): void {
  const record: MonthRecord<T> = {
    cachedAt: Date.now(),
    month: monthIso,
    payload,
  };
  safeSet(monthKeyOf(monthIso), JSON.stringify(record));
  pruneMonths();
}

/** Read a cached month response (any age — a month's times don't expire). */
export function readMonth<T>(monthIso: string): T | null {
  const raw = safeGet(monthKeyOf(monthIso));
  if (!raw) return null;
  try {
    const record = JSON.parse(raw) as MonthRecord<T>;
    return record.payload;
  } catch {
    return null;
  }
}

/** Keep only the most-recently-cached MAX_MONTHS month entries. */
function pruneMonths(): void {
  try {
    const entries: Array<{ key: string; cachedAt: number }> = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(MONTH_PREFIX)) continue;
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      try {
        const rec = JSON.parse(raw) as MonthRecord<unknown>;
        entries.push({ key, cachedAt: rec.cachedAt || 0 });
      } catch {
        safeRemove(key);
      }
    }
    if (entries.length <= MAX_MONTHS) return;
    entries.sort((a, b) => b.cachedAt - a.cachedAt); // newest first
    entries.slice(MAX_MONTHS).forEach((e) => safeRemove(e.key));
  } catch {
    // ignore
  }
}

// ── Utility ───────────────────────────────────────────────────────────────────

/** True if the device currently reports being online. */
export function isOnline(): boolean {
  try {
    return typeof navigator !== "undefined" ? navigator.onLine : true;
  } catch {
    return true;
  }
}

/** Clear all cached prayer data (e.g. on logout or location reset). */
export function clearPrayerCache(): void {
  try {
    safeRemove(TODAY_KEY);
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(MONTH_PREFIX)) toRemove.push(key);
    }
    toRemove.forEach(safeRemove);
  } catch {
    // ignore
  }
}
