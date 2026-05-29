import { useEffect, useMemo, useState } from "react";
import { Logo } from "../shared/Logo";
import { Navigation } from "../shared/Navigation";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  MapPin,
  Clock3,
  Download,
  Sun,
  Sunrise,
  Sunset,
} from "lucide-react";
import { apiFetch } from "../../lib/api";
import { toHijri, prayerName, getCurrentLang } from "../../lib/i18n";

type PrayerTimes = {
  fajr: string;
  sunrise: string;
  dhuhr: string;
  asr: string;
  maghrib: string;
  isha: string;
};

type DayEntry = {
  date: string;
  source: "calculation" | "mosque" | "personal" | "city" | string;
  prayers: PrayerTimes;
};

type CalendarResponse = {
  location?: { city?: string; country?: string; timezone?: string; label?: string };
  mosque?: { name?: string | null; address?: string | null };
  method?: { sect?: string; calculationMethod?: string; madhhab?: string };
  sourceDetail?: {
    preferred?: string;
    actual?: string;
    useMosqueLocation?: boolean;
    label?: string;
    fallbackReason?: string | null;
  };
  month: string;
  days: DayEntry[];
};

const PRAYER_COLUMNS: Array<keyof PrayerTimes> = [
  "fajr",
  "sunrise",
  "dhuhr",
  "asr",
  "maghrib",
  "isha",
];

const PRAYER_LABELS: Record<keyof PrayerTimes, string> = {
  fajr: "Fajr",
  sunrise: "Sunrise",
  dhuhr: "Dhuhr",
  asr: "Asr",
  maghrib: "Maghrib",
  isha: "Isha",
};

const PRAYER_ICONS: Record<keyof PrayerTimes, any> = {
  fajr: Sun,
  sunrise: Sunrise,
  dhuhr: Sun,
  asr: Sun,
  maghrib: Sunset,
  isha: Sun,
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function monthKeyFromDate(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

function titleCase(value?: string | null) {
  return (
    String(value || "")
      .replace(/([A-Z])/g, " $1")
      .replace(/[_-]+/g, " ")
      .trim()
      .toLowerCase()
      .replace(/\b\w/g, (c) => c.toUpperCase()) || "—"
  );
}

function getSourceBadgeClass(source?: string) {
  if (source === "mosque") return "bg-emerald-500/10 text-emerald-400 border-emerald-500/30";
  if (source === "personal") return "bg-cyan-500/10 text-cyan-300 border-cyan-500/20";
  return "bg-slate-800/50 text-slate-300 border-slate-700/50";
}

function formatDisplayDate(isoDate: string) {
  const d = new Date(`${isoDate}T12:00:00`);
  if (Number.isNaN(d.getTime())) {
    return { day: isoDate, weekday: "", month: "", year: "", fullDate: isoDate };
  }
  return {
    day: d.toLocaleDateString(undefined, { day: "2-digit" }),
    weekday: d.toLocaleDateString(undefined, { weekday: "short" }),
    month: d.toLocaleDateString(undefined, { month: "long" }),
    year: d.toLocaleDateString(undefined, { year: "numeric" }),
    fullDate: d.toLocaleDateString(undefined, {
      day: "2-digit",
      month: "long",
      year: "numeric",
    }),
  };
}

export default function CalendarView() {
  const [month, setMonth] = useState(() => monthKeyFromDate(new Date()));
  const [data, setData] = useState<CalendarResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<DayEntry | null>(null);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        setError(null);
        const res = await apiFetch(
          `/api/prayer-times/month?month=${encodeURIComponent(month)}`
        );
        if (!res.ok) throw new Error(`Failed to load calendar (${res.status})`);
        const json = (await res.json()) as CalendarResponse;
        setData(json);
        setSelectedDay(null);
      } catch (err) {
        console.error(err);
        setError(err instanceof Error ? err.message : "Unable to load calendar.");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [month]);

  const currentDate = useMemo(() => {
    const [year, mon] = month.split("-").map(Number);
    return new Date(year, mon - 1, 1, 12, 0, 0);
  }, [month]);

  const monthLabel = useMemo(
    () => currentDate.toLocaleDateString(undefined, { month: "long", year: "numeric" }),
    [currentDate]
  );

  const locationLabel =
    data?.sourceDetail?.useMosqueLocation && data?.mosque?.name
      ? data.mosque.name
      : data?.location?.label ||
        [data?.location?.city, data?.location?.country].filter(Boolean).join(", ") ||
        "Saved location";

  const goMonth = (delta: number) => {
    const next = new Date(currentDate);
    next.setMonth(next.getMonth() + delta);
    setMonth(monthKeyFromDate(next));
    setSelectedDay(null);
  };

  const todayStr = new Date().toISOString().slice(0, 10);

  return (
    <div className="min-h-screen bg-slate-950 overscroll-none">
      {/* Sticky Header */}
      <div
        className="sticky top-0 z-20 bg-slate-950/95 backdrop-blur-sm border-b border-slate-800/50"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <div className="max-w-7xl mx-auto px-4 py-4 md:px-6">
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <Logo />
              <Navigation />
            </div>

            {/* Month navigation in the header so it's always visible */}
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  className="border-slate-700 bg-slate-900/50 text-slate-300 hover:bg-slate-800 hover:text-white w-9 h-9 touch-manipulation"
                  onClick={() => goMonth(-1)}
                  aria-label="Previous month"
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>

                <div className="rounded-lg border border-slate-700 bg-slate-900/70 px-4 py-2 min-w-[160px] text-center">
                  <div className="text-white font-semibold text-sm md:text-base">{monthLabel}</div>
                  {toHijri(currentDate, getCurrentLang()) && (
                    <div className="text-slate-500 text-xs mt-0.5">{toHijri(currentDate, getCurrentLang())}</div>
                  )}
                </div>

                <Button
                  variant="outline"
                  size="icon"
                  className="border-slate-700 bg-slate-900/50 text-slate-300 hover:bg-slate-800 hover:text-white w-9 h-9 touch-manipulation"
                  onClick={() => goMonth(1)}
                  aria-label="Next month"
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>

              <div className="flex items-center gap-2">
                {selectedDay && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-slate-700 text-slate-300 hover:bg-slate-800 text-xs touch-manipulation"
                    onClick={() => setSelectedDay(null)}
                  >
                    ← Month
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="icon"
                  className="border-slate-700 bg-slate-900/50 text-slate-300 hover:bg-slate-800 hover:text-white w-9 h-9 touch-manipulation"
                  title="Export calendar (coming soon)"
                >
                  <Download className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div
        className="max-w-7xl mx-auto px-4 py-4 md:px-6 md:py-5 space-y-4"
        style={{ paddingBottom: "calc(1.25rem + env(safe-area-inset-bottom))" }}
      >
        {/* Meta info strip */}
        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex items-center gap-1.5 text-slate-400 text-xs">
            <MapPin className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-slate-200 font-medium">{locationLabel}</span>
          </div>
          <div className="flex items-center gap-1.5 text-slate-400 text-xs">
            <Clock3 className="w-3.5 h-3.5 text-cyan-400" />
            <span>{data?.location?.timezone || "Etc/UTC"}</span>
          </div>
          {data?.sourceDetail?.actual && (
            <Badge
              variant="outline"
              className={`${getSourceBadgeClass(data.sourceDetail.actual)} text-xs px-2 py-0.5`}
            >
              {titleCase(data.sourceDetail.actual)}
            </Badge>
          )}
          {data?.method?.sect && (
            <span className="text-slate-500 text-xs">{titleCase(data.method.sect)}</span>
          )}
          {data?.method?.calculationMethod && (
            <span className="text-slate-500 text-xs">· {titleCase(data.method.calculationMethod)}</span>
          )}
        </div>

        {/* Fallback reason */}
        {data?.sourceDetail?.fallbackReason && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
            {data.sourceDetail.fallbackReason}
          </div>
        )}

        {/* Calendar Content */}
        {loading ? (
          <div className="rounded-2xl border border-slate-800/60 bg-slate-900/40 p-12 flex flex-col items-center gap-4">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-400" />
            <p className="text-slate-400 text-sm">Loading prayer times…</p>
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-8 flex flex-col items-center gap-3">
            <p className="text-red-300 text-sm font-medium">{error}</p>
            <Button
              variant="outline"
              size="sm"
              className="border-red-500/30 text-red-300 hover:bg-red-500/20 touch-manipulation"
              onClick={() => window.location.reload()}
            >
              Try Again
            </Button>
          </div>
        ) : !data || data.days.length === 0 ? (
          <div className="rounded-2xl border border-slate-800/60 bg-slate-900/40 p-12 flex flex-col items-center gap-3">
            <CalendarIcon className="w-8 h-8 text-slate-500" />
            <p className="text-slate-400 text-sm">No prayer times available for this month.</p>
          </div>
        ) : selectedDay ? (
          /* ── Day detail view ── */
          <div className="space-y-4">
            <div className="rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/10 via-teal-500/5 to-slate-900/40 p-5">
              <div className="text-emerald-400 text-sm font-semibold mb-1">
                {formatDisplayDate(selectedDay.date).weekday}
              </div>
              <h2 className="text-white text-2xl font-bold">
                {formatDisplayDate(selectedDay.date).fullDate}
              </h2>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {PRAYER_COLUMNS.map((col) => {
                const Icon = PRAYER_ICONS[col];
                return (
                  <div
                    key={col}
                    className="rounded-2xl border border-slate-800/60 bg-slate-900/40 p-5"
                  >
                    <div className="flex items-center gap-2 mb-3">
                      <div className="rounded-lg bg-slate-800/60 p-2">
                        <Icon className="w-4 h-4 text-emerald-400" />
                      </div>
                      <span className="text-slate-300 font-medium text-sm">
                        {PRAYER_LABELS[col]}
                      </span>
                    </div>
                    <div className="text-white text-3xl font-bold tabular-nums">
                      {selectedDay.prayers[col] || "--:--"}
                    </div>
                    <div className="text-slate-500 text-xs mt-1">
                      {data?.location?.timezone || "local time"}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          /* ── Month view ── */
          <>
            {/* Desktop: full table */}
            <div className="hidden lg:block rounded-2xl border border-slate-800/60 bg-slate-900/40 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead className="bg-slate-900/80 sticky top-0 z-10">
                    <tr className="border-b border-slate-800">
                      <th className="text-left px-4 py-3 text-slate-300 font-semibold text-sm">Date</th>
                      {PRAYER_COLUMNS.map((col) => (
                        <th key={col} className="text-left px-3 py-3 text-slate-300 font-semibold text-sm whitespace-nowrap">
                          {PRAYER_LABELS[col]}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.days.map((day) => {
                      const display = formatDisplayDate(day.date);
                      const isToday = day.date === todayStr;
                      return (
                        <tr
                          key={day.date}
                          className={`border-b border-slate-800/50 cursor-pointer transition-colors touch-manipulation ${
                            isToday
                              ? "bg-emerald-500/5 hover:bg-emerald-500/10"
                              : "hover:bg-slate-800/30"
                          }`}
                          onClick={() => setSelectedDay(day)}
                        >
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className={`flex items-center justify-center w-9 h-9 rounded-lg ${
                                isToday ? "bg-emerald-500/20 border border-emerald-500/30" : "bg-slate-800/40"
                              }`}>
                                <span className={`text-sm font-semibold ${isToday ? "text-emerald-300" : "text-slate-200"}`}>
                                  {display.day}
                                </span>
                              </div>
                              <div>
                                <div className="text-slate-200 font-medium text-sm">{display.weekday}</div>
                                <div className="text-slate-500 text-xs">{isToday ? "Today" : display.month}</div>
                              </div>
                            </div>
                          </td>
                          {PRAYER_COLUMNS.map((col) => (
                            <td key={col} className="px-3 py-3">
                              <span className="text-slate-100 font-medium text-sm tabular-nums">
                                {day.prayers[col] || "--:--"}
                              </span>
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Mobile: compact list — one row per day, tap for details */}
            <div className="lg:hidden rounded-2xl border border-slate-800/60 bg-slate-900/40 overflow-hidden">
              {/* Column headers */}
              <div className="grid grid-cols-[64px_1fr_1fr_1fr] gap-0 px-3 py-2 border-b border-slate-800 bg-slate-900/70">
                <div className="text-slate-500 text-[10px] font-medium uppercase tracking-wide">Date</div>
                <div className="text-slate-500 text-[10px] font-medium uppercase tracking-wide text-center">Fajr</div>
                <div className="text-slate-500 text-[10px] font-medium uppercase tracking-wide text-center">Dhuhr</div>
                <div className="text-slate-500 text-[10px] font-medium uppercase tracking-wide text-center">Maghrib</div>
              </div>

              {/* Rows */}
              {data.days.map((day) => {
                const display = formatDisplayDate(day.date);
                const isToday = day.date === todayStr;
                return (
                  <button
                    key={day.date}
                    type="button"
                    onClick={() => setSelectedDay(day)}
                    className={`w-full grid grid-cols-[64px_1fr_1fr_1fr] gap-0 px-3 py-2.5 border-b border-slate-800/50 last:border-b-0 text-left touch-manipulation transition-colors active:bg-slate-800/50 ${
                      isToday ? "bg-emerald-500/5" : "hover:bg-slate-800/20"
                    }`}
                  >
                    {/* Date cell */}
                    <div className="flex items-center gap-1.5">
                      <div className={`flex items-center justify-center w-8 h-8 rounded-lg flex-shrink-0 ${
                        isToday ? "bg-emerald-500/20 border border-emerald-500/40" : "bg-slate-800/40"
                      }`}>
                        <span className={`text-sm font-bold ${isToday ? "text-emerald-300" : "text-slate-200"}`}>
                          {display.day}
                        </span>
                      </div>
                      <span className={`text-[10px] font-medium ${isToday ? "text-emerald-400" : "text-slate-500"}`}>
                        {display.weekday}
                      </span>
                    </div>

                    {/* 3 key prayer times */}
                    {(["fajr", "dhuhr", "maghrib"] as const).map((col) => (
                      <div key={col} className="flex items-center justify-center">
                        <span className={`text-sm tabular-nums font-medium ${isToday ? "text-emerald-200" : "text-slate-200"}`}>
                          {day.prayers[col] || "--:--"}
                        </span>
                      </div>
                    ))}
                  </button>
                );
              })}

              {/* Mobile footer hint */}
              <div className="px-3 py-2 bg-slate-900/60 border-t border-slate-800">
                <p className="text-slate-500 text-[10px] text-center">
                  Tap any day to see all 6 prayer times · Showing Fajr, Dhuhr, Maghrib
                </p>
              </div>
            </div>
          </>
        )}

        {/* Footer note */}
        <p className="text-slate-500 text-xs text-center px-2 leading-relaxed">
          Prayer times based on your saved location and calculation method. Verify with your local mosque for exact times.
        </p>
      </div>
    </div>
  );
}
