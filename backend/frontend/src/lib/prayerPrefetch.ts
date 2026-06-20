// lib/prayerPrefetch.ts
//
// Background prefetch of the current + next month of prayer times while online.
// Because the backend returns a full month per call (Aladhan-backed), caching
// two months gives ~60 days of EXACT offline coverage — no on-device
// recalculation, no drift. Fire-and-forget; never throws into the UI.

import { apiFetch } from "./api";
import { cacheMonth, isOnline } from "./prayerCache";

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export async function prefetchUpcomingMonths(): Promise<void> {
  if (!isOnline()) return;

  const now = new Date();
  const months = [
    now,
    new Date(now.getFullYear(), now.getMonth() + 1, 1),
  ].map(monthKey);

  for (const m of months) {
    try {
      const res = await apiFetch(
        `/api/prayer-times/month?month=${encodeURIComponent(m)}`
      );
      if (res.ok) {
        const json = await res.json();
        cacheMonth(m, json);
      }
    } catch {
      // best-effort — ignore failures
    }
  }
}
