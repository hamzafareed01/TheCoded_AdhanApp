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
  if (source === "mosque") {
    return "bg-emerald-500/10 text-emerald-400 border-emerald-500/30";
  }
  if (source === "personal") {
    return "bg-cyan-500/10 text-cyan-300 border-cyan-500/20";
  }
  return "bg-slate-800/50 text-slate-300 border-slate-700/50";
}
 
function formatDisplayDate(isoDate: string) {
  const d = new Date(`${isoDate}T12:00:00`);
  if (Number.isNaN(d.getTime())) {
    return { day: isoDate, weekday: "", month: "", year: "" };
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
 
// Simple Hijri date approximation (for display purposes)
// In production, use a proper library or API
function getHijriDate(gregorianDate: Date): string {
  // Simple approximation: Hijri year is roughly 579 years ahead
  // This is for display only - not astronomically accurate
  const hijriYear = gregorianDate.getFullYear() - 579;
  const hijriMonths = [
    "Muharram", "Safar", "Rabi' al-Awwal", "Rabi' al-Thani",
    "Jumada al-Awwal", "Jumada al-Thani", "Rajab", "Sha'ban",
    "Ramadan", "Shawwal", "Dhu al-Qi'dah", "Dhu al-Hijjah"
  ];
  
  // Approximate month (this is just for display)
  const monthIndex = (gregorianDate.getMonth() + 1) % 12;
  const day = gregorianDate.getDate();
  
  return `${day} ${hijriMonths[monthIndex]} ${hijriYear}`;
}
 
export default function CalendarView() {
  const [month, setMonth] = useState(() => monthKeyFromDate(new Date()));
  const [data, setData] = useState<CalendarResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"month" | "day">("month");
  const [selectedDay, setSelectedDay] = useState<DayEntry | null>(null);
 
  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        setError(null);
        const res = await apiFetch(
          `/api/prayer-times/month?month=${encodeURIComponent(month)}`
        );
        if (!res.ok) {
          throw new Error(`Failed to load calendar (${res.status})`);
        }
        const json = (await res.json()) as CalendarResponse;
        setData(json);
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
    () =>
      currentDate.toLocaleDateString(undefined, {
        month: "long",
        year: "numeric",
      }),
    [currentDate]
  );
 
  const hijriMonthLabel = useMemo(() => {
    return getHijriDate(currentDate);
  }, [currentDate]);
 
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
    setViewMode("month");
    setSelectedDay(null);
  };
 
  const handleDayClick = (day: DayEntry) => {
    setSelectedDay(day);
    setViewMode("day");
  };
 
  const handleBackToMonth = () => {
    setViewMode("month");
    setSelectedDay(null);
  };
 
  return (
    <div className="min-h-screen bg-slate-950 overscroll-none">
      {/* Sticky Header */}
      <div className="sticky top-0 z-20 bg-slate-950/95 backdrop-blur-sm border-b border-slate-800/50" style={{ paddingTop: "env(safe-area-inset-top)" }}>
        <div className="max-w-7xl mx-auto px-4 py-4 md:px-6">
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <Logo />
            </div>
            <Navigation />
          </div>
        </div>
      </div>
 
      <div className="max-w-7xl mx-auto px-4 py-5 space-y-5 md:px-6 md:py-6 md:space-y-6" style={{ paddingBottom: "calc(1.25rem + env(safe-area-inset-bottom))" }}>
        {/* Hero Section - Mobile Optimized */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-500/10 via-teal-500/5 to-slate-900 border border-emerald-500/20 p-6 md:p-8">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.08),transparent_60%)]" />
 
          <div className="relative flex flex-col md:flex-row md:items-start md:justify-between gap-6">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-4">
                <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-3">
                  <CalendarIcon className="w-6 h-6 text-emerald-400" />
                </div>
                <div>
                  <h1 className="text-white text-2xl md:text-3xl font-semibold">
                    Prayer Calendar
                  </h1>
                </div>
              </div>
              <p className="text-slate-400 text-sm leading-relaxed">
                Monthly prayer timetable • Tap any day for details
              </p>
            </div>
 
            <div className="flex flex-col gap-3 items-start md:items-end">
              <Badge
                variant="outline"
                className={`${getSourceBadgeClass(data?.sourceDetail?.actual)} text-sm px-3 py-1.5`}
              >
                {titleCase(data?.sourceDetail?.actual || "personal")}
              </Badge>
              <div className="md:text-right">
                <div className="text-slate-500 text-xs mb-1 font-medium">Hijri Calendar</div>
                <div className="text-emerald-300 text-sm font-semibold">{hijriMonthLabel}</div>
              </div>
            </div>
          </div>
        </div>
 
        {/* Location & Settings Info - Touch Optimized */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-2xl border border-slate-800/60 bg-slate-900/40 backdrop-blur-sm px-5 py-4 min-h-[80px] flex flex-col justify-center">
            <div className="flex items-center gap-2.5 mb-2">
              <div className="rounded-lg bg-emerald-500/10 p-1.5">
                <MapPin className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="text-slate-400 text-xs font-medium">Location</div>
            </div>
            <div className="text-slate-100 font-semibold text-sm leading-snug">
              {locationLabel}
            </div>
          </div>
 
          <div className="rounded-2xl border border-slate-800/60 bg-slate-900/40 backdrop-blur-sm px-5 py-4 min-h-[80px] flex flex-col justify-center">
            <div className="flex items-center gap-2.5 mb-2">
              <div className="rounded-lg bg-cyan-500/10 p-1.5">
                <Clock3 className="w-4 h-4 text-cyan-400" />
              </div>
              <div className="text-slate-400 text-xs font-medium">Timezone</div>
            </div>
            <div className="text-slate-100 font-semibold text-sm leading-snug">
              {data?.location?.timezone || "Etc/UTC"}
            </div>
          </div>
 
          <div className="rounded-2xl border border-slate-800/60 bg-slate-900/40 backdrop-blur-sm px-5 py-4 min-h-[80px] flex flex-col justify-center">
            <div className="text-slate-400 text-xs mb-2 font-medium">Sect</div>
            <div className="text-slate-100 font-semibold text-sm">
              {titleCase(data?.method?.sect || "SUNNI")}
            </div>
          </div>
 
          <div className="rounded-2xl border border-slate-800/60 bg-slate-900/40 backdrop-blur-sm px-5 py-4 min-h-[80px] flex flex-col justify-center">
            <div className="text-slate-400 text-xs mb-2 font-medium">Calculation Method</div>
            <div className="text-slate-100 font-semibold text-sm">
              {titleCase(data?.method?.calculationMethod || "isna")}
            </div>
          </div>
        </div>
 
        {/* Fallback Reason Alert */}
        {data?.sourceDetail?.fallbackReason && (
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3.5 flex items-start gap-3">
            <div className="rounded-lg bg-amber-500/20 p-1.5 mt-0.5">
              <Clock3 className="w-4 h-4 text-amber-300" />
            </div>
            <p className="text-sm text-amber-200 leading-relaxed flex-1">
              {data.sourceDetail.fallbackReason}
            </p>
          </div>
        )}
 
        {/* Month Navigation - Touch Optimized */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="icon"
              className="border-slate-700 bg-slate-900/50 text-slate-300 hover:bg-slate-800 hover:text-white min-h-[44px] w-11 touch-manipulation active:bg-slate-800"
              onClick={() => goMonth(-1)}
              aria-label="Previous month"
            >
              <ChevronLeft className="w-5 h-5" />
            </Button>
 
            <div className="rounded-xl border border-slate-700 bg-slate-900/70 backdrop-blur-sm px-4 md:px-5 py-3 min-w-[180px] text-center">
              <div className="text-white font-semibold text-base md:text-lg">
                {monthLabel}
              </div>
            </div>
 
            <Button
              variant="outline"
              size="icon"
              className="border-slate-700 bg-slate-900/50 text-slate-300 hover:bg-slate-800 hover:text-white min-h-[44px] w-11 touch-manipulation active:bg-slate-800"
              onClick={() => goMonth(1)}
              aria-label="Next month"
            >
              <ChevronRight className="w-5 h-5" />
            </Button>
          </div>
 
          <div className="flex items-center gap-3">
            {viewMode === "day" && (
              <Button
                variant="outline"
                className="border-slate-700 bg-slate-900/50 text-slate-300 hover:bg-slate-800 hover:text-white text-sm min-h-[44px] touch-manipulation active:bg-slate-800"
                onClick={handleBackToMonth}
              >
                ← Back to Month
              </Button>
            )}
 
            <Button
              variant="outline"
              size="icon"
              className="border-slate-700 bg-slate-900/50 text-slate-300 hover:bg-slate-800 hover:text-white min-h-[44px] w-11 touch-manipulation active:bg-slate-800"
              title="Export calendar (feature coming soon)"
              aria-label="Export calendar"
            >
              <Download className="w-4 h-4" />
            </Button>
          </div>
        </div>
 
        {/* Calendar Content */}
        {loading ? (
          <div className="rounded-3xl border border-slate-800/60 bg-slate-900/40 backdrop-blur-sm p-12">
            <div className="flex flex-col items-center justify-center gap-4">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-emerald-400"></div>
              <p className="text-slate-400 text-sm">Loading prayer times...</p>
            </div>
          </div>
        ) : error ? (
          <div className="rounded-3xl border border-red-500/30 bg-red-500/10 p-8">
            <div className="flex flex-col items-center justify-center gap-3">
              <div className="rounded-xl bg-red-500/20 p-3">
                <CalendarIcon className="w-6 h-6 text-red-400" />
              </div>
              <p className="text-red-300 text-sm font-medium">{error}</p>
              <Button
                variant="outline"
                size="sm"
                className="border-red-500/30 text-red-300 hover:bg-red-500/20 mt-2 min-h-[44px] touch-manipulation"
                onClick={() => window.location.reload()}
              >
                Try Again
              </Button>
            </div>
          </div>
        ) : !data || data.days.length === 0 ? (
          <div className="rounded-3xl border border-slate-800/60 bg-slate-900/40 backdrop-blur-sm p-12">
            <div className="flex flex-col items-center justify-center gap-3">
              <div className="rounded-xl bg-slate-800/50 p-3">
                <CalendarIcon className="w-6 h-6 text-slate-500" />
              </div>
              <p className="text-slate-400 text-sm">No prayer times available for this month.</p>
            </div>
          </div>
        ) : viewMode === "month" ? (
          <>
            {/* Desktop: Table View */}
            <div className="hidden lg:block rounded-3xl border border-slate-800/60 bg-slate-900/40 backdrop-blur-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead className="bg-slate-900/80 sticky top-0 z-10">
                    <tr className="border-b border-slate-800">
                      <th className="text-left px-5 py-4 text-slate-300 font-semibold text-sm">
                        Date
                      </th>
                      {PRAYER_COLUMNS.map((column) => (
                        <th
                          key={column}
                          className="text-left px-4 py-4 text-slate-300 font-semibold text-sm whitespace-nowrap"
                        >
                          {PRAYER_LABELS[column]}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.days.map((day) => {
                      const display = formatDisplayDate(day.date);
                      const isToday = day.date === new Date().toISOString().slice(0, 10);
                      return (
                        <tr
                          key={day.date}
                          className={`border-b border-slate-800/50 cursor-pointer transition-all duration-200 touch-manipulation active:opacity-80 ${
                            isToday
                              ? "bg-emerald-500/5 hover:bg-emerald-500/10"
                              : "hover:bg-slate-800/30"
                          }`}
                          onClick={() => handleDayClick(day)}
                        >
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-3">
                              <div className={`flex items-center justify-center w-10 h-10 rounded-lg ${
                                isToday 
                                  ? "bg-emerald-500/20 border border-emerald-500/30" 
                                  : "bg-slate-800/40"
                              }`}>
                                <span className={`text-base font-semibold ${
                                  isToday ? "text-emerald-300" : "text-slate-200"
                                }`}>
                                  {display.day}
                                </span>
                              </div>
                              <div>
                                <div className="text-slate-200 font-medium text-sm">
                                  {display.weekday}
                                </div>
                                <div className="text-slate-500 text-xs">
                                  {isToday ? "Today" : display.month}
                                </div>
                              </div>
                            </div>
                          </td>
                          {PRAYER_COLUMNS.map((column) => (
                            <td key={column} className="px-4 py-4">
                              <div className="text-slate-100 font-medium text-sm tabular-nums">
                                {day.prayers[column] || "--:--"}
                              </div>
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
 
            {/* Mobile: Card View - Touch Optimized */}
            <div className="lg:hidden space-y-4">
              {data.days.map((day) => {
                const display = formatDisplayDate(day.date);
                const isToday = day.date === new Date().toISOString().slice(0, 10);
                return (
                  <button
                    key={day.date}
                    type="button"
                    className={`w-full rounded-2xl border backdrop-blur-sm p-5 cursor-pointer transition-all duration-200 text-left touch-manipulation active:scale-[0.98] ${
                      isToday
                        ? "border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 to-slate-900/40 shadow-lg shadow-emerald-500/5"
                        : "border-slate-800/60 bg-slate-900/40 hover:border-slate-700 active:bg-slate-800/50"
                    }`}
                    onClick={() => handleDayClick(day)}
                  >
                    <div className="flex items-center justify-between mb-5">
                      <div className="flex items-center gap-3">
                        <div className={`flex items-center justify-center w-14 h-14 rounded-xl ${
                          isToday
                            ? "bg-emerald-500/20 border-2 border-emerald-500/40"
                            : "bg-slate-800/60"
                        }`}>
                          <span className={`text-xl font-bold ${
                            isToday ? "text-emerald-300" : "text-slate-200"
                          }`}>
                            {display.day}
                          </span>
                        </div>
                        <div>
                          <div className="text-white font-semibold text-base">
                            {display.weekday}
                          </div>
                          <div className="text-slate-400 text-sm">
                            {isToday ? "Today" : display.month}
                          </div>
                        </div>
                      </div>
                      {isToday && (
                        <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30 text-xs px-3 py-1">
                          Today
                        </Badge>
                      )}
                    </div>
 
                    <div className="grid grid-cols-2 gap-4">
                      {PRAYER_COLUMNS.map((column) => {
                        const Icon = PRAYER_ICONS[column];
                        return (
                          <div key={column} className="flex items-center gap-2.5">
                            <div className="rounded-lg bg-slate-800/50 p-1.5 flex-shrink-0">
                              <Icon className="w-4 h-4 text-emerald-400" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-slate-400 text-xs mb-0.5">
                                {PRAYER_LABELS[column]}
                              </div>
                              <div className="text-slate-100 font-semibold text-sm tabular-nums">
                                {day.prayers[column] || "--:--"}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        ) : selectedDay ? (
          // Day Detail View - Mobile Optimized
          <div className="space-y-5">
            <div className="rounded-3xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/10 via-teal-500/5 to-slate-900/40 backdrop-blur-sm p-6 md:p-8">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                <div className="flex-1">
                  <div className="text-emerald-400 text-sm font-semibold mb-2">
                    {formatDisplayDate(selectedDay.date).weekday}
                  </div>
                  <h2 className="text-white text-2xl md:text-3xl font-bold mb-3">
                    {formatDisplayDate(selectedDay.date).fullDate}
                  </h2>
                  <div className="text-slate-300 text-sm font-medium">
                    {getHijriDate(new Date(`${selectedDay.date}T12:00:00`))}
                  </div>
                </div>
                <Badge
                  variant="outline"
                  className={`${getSourceBadgeClass(selectedDay.source)} text-xs px-3 py-1.5 self-start`}
                >
                  {titleCase(selectedDay.source)}
                </Badge>
              </div>
            </div>
 
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {PRAYER_COLUMNS.map((column) => {
                const Icon = PRAYER_ICONS[column];
                return (
                  <div
                    key={column}
                    className="rounded-2xl border border-slate-800/60 bg-slate-900/40 backdrop-blur-sm p-6 hover:border-slate-700 transition-all duration-200 touch-manipulation"
                  >
                    <div className="flex items-center gap-3 mb-5">
                      <div className="rounded-lg bg-slate-800/60 p-2.5">
                        <Icon className="w-5 h-5 text-emerald-400" />
                      </div>
                      <div className="text-slate-300 font-semibold text-base">
                        {PRAYER_LABELS[column]}
                      </div>
                    </div>
                    <div className="text-white text-4xl font-bold tabular-nums mb-3">
                      {selectedDay.prayers[column] || "--:--"}
                    </div>
                    <div className="text-slate-500 text-sm">
                      {data?.location?.timezone || "local time"}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
 
        {/* Footer Note */}
        <div className="rounded-2xl border border-slate-800/40 bg-slate-900/20 backdrop-blur-sm px-5 py-4">
          <p className="text-slate-400 text-xs md:text-sm leading-relaxed text-center">
            Prayer times are calculated based on your saved location and selected calculation method. 
            Times may vary slightly from local announcements. Always verify with your local mosque for exact times.
          </p>
        </div>
      </div>
    </div>
  );
}