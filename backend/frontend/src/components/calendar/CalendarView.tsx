
import { useEffect, useMemo, useState, type ComponentType } from "react";
import { Logo } from "../shared/Logo";
import { Navigation } from "../shared/Navigation";
import {
  ChevronLeft,
  ChevronRight,
  MapPin,
  MoonStar,
  Sun,
  Sunrise,
  Sunset,
  Star,
  X,
} from "lucide-react";
import { apiFetch } from "../../lib/api";
 
// ── Types ────────────────────────────────────────────────────────────────────
 
type PrayerTimes = {
  fajr: string; sunrise: string; dhuhr: string;
  asr: string;  maghrib: string; isha: string;
};
 
type DayEntry = {
  date: string;
  source: string;
  prayers: PrayerTimes;
};
 
type CalendarResponse = {
  location?: { city?: string; country?: string; timezone?: string; label?: string };
  mosque?: { name?: string | null };
  method?: { sect?: string; calculationMethod?: string; madhhab?: string };
  sourceDetail?: {
    actual?: string; useMosqueLocation?: boolean;
    label?: string; fallbackReason?: string | null;
  };
  month: string;
  days: DayEntry[];
};
 
// ── Constants ─────────────────────────────────────────────────────────────────
 
const PRAYER_ORDER: Array<keyof PrayerTimes> = [
  "fajr", "sunrise", "dhuhr", "asr", "maghrib", "isha",
];
 
const PRAYER_META: Record<
  keyof PrayerTimes,
  { label: string; Icon: ComponentType<{ className?: string }>; color: string; bg: string; border: string }
> = {
  fajr:    { label: "Fajr",    Icon: MoonStar, color: "text-indigo-300", bg: "bg-indigo-500/10",  border: "border-indigo-500/20"  },
  sunrise: { label: "Sunrise", Icon: Sunrise,  color: "text-amber-300",  bg: "bg-amber-500/10",   border: "border-amber-500/20"   },
  dhuhr:   { label: "Dhuhr",   Icon: Sun,      color: "text-yellow-300", bg: "bg-yellow-500/10",  border: "border-yellow-500/20"  },
  asr:     { label: "Asr",     Icon: Sun,      color: "text-orange-300", bg: "bg-orange-500/10",  border: "border-orange-500/20"  },
  maghrib: { label: "Maghrib", Icon: Sunset,   color: "text-rose-300",   bg: "bg-rose-500/10",    border: "border-rose-500/20"    },
  isha:    { label: "Isha",    Icon: Star,     color: "text-violet-300", bg: "bg-violet-500/10",  border: "border-violet-500/20"  },
};
 
const DOW_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
 
// ── Helpers ───────────────────────────────────────────────────────────────────
 
function pad2(n: number) { return String(n).padStart(2, "0"); }
function monthKey(d: Date) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`; }
 
// Local calendar date (NOT UTC) — avoids "today" landing on the wrong day
// for users behind UTC in the evening.
function localISODate(d: Date = new Date()) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
 
function titleCase(v?: string | null) {
  return String(v || "").replace(/([A-Z])/g, " $1").replace(/[_-]+/g, " ")
    .trim().toLowerCase().replace(/\b\w/g, c => c.toUpperCase()) || "—";
}
 
// Native Intl Umm al-Qura calendar — matches the Dashboard's Hijri source.
function hijriFmt(d: Date): string {
  try {
    return new Intl.DateTimeFormat("en-u-ca-islamic-umalqura", {
      day: "numeric", month: "long", year: "numeric",
    }).format(d);
  } catch { return ""; }
}
 
function gregFmt(iso: string) {
  const d = new Date(`${iso}T12:00:00`);
  return {
    day:     d.toLocaleDateString(undefined, { day: "2-digit" }),
    weekday: d.toLocaleDateString(undefined, { weekday: "long" }),
    full:    d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" }),
    dow:     d.getDay(),
  };
}
 
// ── Component ─────────────────────────────────────────────────────────────────
 
export default function CalendarView() {
  const [month, setMonth]           = useState(() => monthKey(new Date()));
  const [data, setData]             = useState<CalendarResponse | null>(null);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<DayEntry | null>(null);
 
  // Recomputed each render so it stays correct if the app is left open past midnight.
  const todayIso = localISODate();
 
  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        setError(null);
        const res = await apiFetch(`/api/prayer-times/month?month=${encodeURIComponent(month)}`);
        if (!res.ok) throw new Error(`Failed to load (${res.status})`);
        const json = (await res.json()) as CalendarResponse;
        setData(json);
        // Auto-select today if it's in this month, otherwise first day
        const today = localISODate();
        setSelectedDay(json.days.find(d => d.date === today) ?? json.days[0] ?? null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to load calendar.");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [month]);
 
  const currentDate = useMemo(() => {
    const [y, m] = month.split("-").map(Number);
    return new Date(y, m - 1, 1, 12);
  }, [month]);
 
  const monthLabel  = currentDate.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const hijriLabel  = hijriFmt(currentDate);
 
  const locationLabel =
    data?.sourceDetail?.useMosqueLocation && data?.mosque?.name
      ? data.mosque.name
      : data?.location?.label ||
        [data?.location?.city, data?.location?.country].filter(Boolean).join(", ") ||
        "Saved location";
 
  // Build 7-column grid cells (null = blank padding day)
  const calendarCells = useMemo(() => {
    if (!data) return [];
    const [y, m] = month.split("-").map(Number);
    const startDow = new Date(y, m - 1, 1).getDay();
    const cells: (DayEntry | null)[] = Array(startDow).fill(null);
    cells.push(...data.days);
    const rem = cells.length % 7;
    if (rem > 0) cells.push(...Array(7 - rem).fill(null));
    return cells;
  }, [data, month]);
 
  const goMonth = (delta: number) => {
    const next = new Date(currentDate);
    next.setMonth(next.getMonth() + delta);
    setMonth(monthKey(next));
    setSelectedDay(null);
  };
 
  return (
    <div
      className="min-h-screen bg-slate-950 overscroll-none"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
 
      {/* ── Sticky Header ─────────────────────────────────────────────── */}
      <div className="sticky top-0 z-20 bg-slate-950/90 backdrop-blur-md border-b border-white/5">
        <div className="max-w-7xl mx-auto px-4 py-3 md:px-6">
          <div className="flex items-center justify-between gap-4">
            <Logo />
            <Navigation />
          </div>
        </div>
      </div>
 
      <div
        className="max-w-7xl mx-auto px-4 py-6 md:px-6 md:py-8 space-y-5"
        style={{ paddingBottom: "calc(1.5rem + env(safe-area-inset-bottom))" }}
      >
 
        {/* ── Page Header ───────────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-white text-xl md:text-2xl">Prayer Calendar</h1>
            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
              <MapPin className="w-3 h-3 text-emerald-400 flex-shrink-0" />
              <span className="text-slate-400 text-xs">{locationLabel}</span>
              {data?.method?.calculationMethod && (
                <>
                  <span className="text-slate-700 text-xs">·</span>
                  <span className="text-slate-400 text-xs">{titleCase(data.method.calculationMethod)}</span>
                </>
              )}
              {data?.method?.sect && (
                <>
                  <span className="text-slate-700 text-xs">·</span>
                  <span className="text-slate-400 text-xs">{titleCase(data.method.sect)}</span>
                </>
              )}
            </div>
            {hijriLabel && (
              <p className="text-white/30 text-xs mt-0.5">{hijriLabel}</p>
            )}
          </div>
 
          {/* Month navigation */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button
              onClick={() => goMonth(-1)}
              aria-label="Previous month"
              className="w-9 h-9 rounded-xl border border-white/8 bg-slate-900/60 text-slate-400 hover:text-white hover:bg-slate-800 flex items-center justify-center transition-colors touch-manipulation"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="px-3 py-2 rounded-xl border border-white/8 bg-slate-900/60 text-white text-sm min-w-[130px] text-center">
              {monthLabel}
            </div>
            <button
              onClick={() => goMonth(1)}
              aria-label="Next month"
              className="w-9 h-9 rounded-xl border border-white/8 bg-slate-900/60 text-slate-400 hover:text-white hover:bg-slate-800 flex items-center justify-center transition-colors touch-manipulation"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
 
        {/* ── Loading ───────────────────────────────────────────────────── */}
        {loading && (
          <div className="rounded-2xl border border-white/6 bg-slate-900/60 p-12 flex flex-col items-center gap-4">
            <div className="w-8 h-8 rounded-full border-2 border-emerald-500/20 border-t-emerald-400 animate-spin" />
            <p className="text-slate-500 text-sm">Loading prayer times…</p>
          </div>
        )}
 
        {/* ── Error ─────────────────────────────────────────────────────── */}
        {!loading && error && (
          <div className="rounded-2xl border border-rose-500/20 bg-rose-500/5 p-8 text-center space-y-3">
            <p className="text-rose-300 text-sm">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="text-xs text-rose-400 underline underline-offset-2 touch-manipulation"
            >
              Try again
            </button>
          </div>
        )}
 
        {/* ── Calendar ──────────────────────────────────────────────────── */}
        {!loading && !error && data && (
          <>
            {/* Calendar grid */}
            <div className="rounded-2xl border border-white/6 bg-slate-900/60 overflow-hidden">
 
              {/* Day-of-week header */}
              <div className="grid grid-cols-7 border-b border-white/[0.06]">
                {DOW_LABELS.map(d => (
                  <div
                    key={d}
                    className={`py-3 text-center text-[11px] font-medium tracking-wide ${
                      d === "Fri" ? "text-emerald-400/70" : "text-slate-600"
                    }`}
                  >
                    {d}
                  </div>
                ))}
              </div>
 
              {/* Day cells */}
              <div className="grid grid-cols-7">
                {calendarCells.map((cell, idx) => {
                  // Blank padding cell
                  if (!cell) return (
                    <div
                      key={`blank-${idx}`}
                      className={`h-11 md:h-16 border-b border-white/[0.03] ${
                        idx % 7 !== 6 ? "border-r border-white/[0.03]" : ""
                      }`}
                    />
                  );
 
                  const isToday    = cell.date === todayIso;
                  const isSelected = selectedDay?.date === cell.date;
                  const isFriday   = gregFmt(cell.date).dow === 5;
                  const dayNum     = parseInt(cell.date.slice(-2));
                  const colIdx     = idx % 7;
 
                  return (
                    <button
                      key={cell.date}
                      onClick={() => setSelectedDay(isSelected ? null : cell)}
                      className={[
                        "relative h-11 md:h-16 flex flex-col items-center justify-center gap-0.5 transition-colors touch-manipulation",
                        "border-b border-white/[0.03]",
                        colIdx !== 6 ? "border-r border-white/[0.03]" : "",
                        isSelected
                          ? "bg-emerald-500/10"
                          : isToday
                          ? "bg-emerald-500/[0.06]"
                          : "hover:bg-white/[0.025] active:bg-white/5",
                      ].join(" ")}
                    >
                      {/* Day number */}
                      <span className={[
                        "w-7 h-7 rounded-full flex items-center justify-center text-sm transition-colors",
                        isToday
                          ? "bg-emerald-500 text-white"
                          : isSelected
                          ? "text-emerald-300"
                          : isFriday
                          ? "text-emerald-400/70"
                          : "text-slate-300",
                      ].join(" ")}>
                        {dayNum}
                      </span>
 
                      {/* Fajr time — desktop only */}
                      <span className="hidden md:block text-[10px] text-slate-600 tabular-nums leading-none">
                        {cell.prayers.fajr || ""}
                      </span>
 
                      {/* Friday dot */}
                      {isFriday && !isToday && (
                        <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-emerald-500/40" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
 
            {/* Selected day detail panel */}
            {selectedDay && (
              <div className="rounded-2xl border border-white/8 bg-slate-900/80 overflow-hidden">
 
                {/* Date bar */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-white text-sm">{gregFmt(selectedDay.date).full}</p>
                      {selectedDay.date === todayIso && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
                          Today
                        </span>
                      )}
                    </div>
                    <p className="text-white/30 text-xs mt-0.5">
                      {hijriFmt(new Date(`${selectedDay.date}T12:00:00`))}
                    </p>
                  </div>
                  <button
                    onClick={() => setSelectedDay(null)}
                    className="text-slate-600 hover:text-slate-400 transition-colors p-1 rounded-lg hover:bg-white/5 touch-manipulation"
                    aria-label="Close"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
 
                {/* Prayer time cells — gap-px trick for dividers */}
                <div className="grid grid-cols-3 md:grid-cols-6 gap-px bg-white/[0.04]">
                  {PRAYER_ORDER.map(key => {
                    const { label, Icon, color, bg, border } = PRAYER_META[key];
                    return (
                      <div
                        key={key}
                        className="bg-slate-900/90 flex flex-col items-center py-5 gap-2"
                      >
                        <div className={`w-9 h-9 rounded-xl ${bg} border ${border} flex items-center justify-center`}>
                          <Icon className={`w-4 h-4 ${color}`} />
                        </div>
                        <span className="text-slate-500 text-xs">{label}</span>
                        <span className={`text-sm tabular-nums ${color}`}>
                          {selectedDay.prayers[key] || "--:--"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
 
            {/* Fallback notice */}
            {data.sourceDetail?.fallbackReason && (
              <p className="text-amber-400/50 text-xs text-center">
                {data.sourceDetail.fallbackReason}
              </p>
            )}
          </>
        )}
 
        <p className="text-slate-700 text-xs text-center pb-2">
          Times based on your saved location and calculation method.
        </p>
      </div>
    </div>
  );
}
 