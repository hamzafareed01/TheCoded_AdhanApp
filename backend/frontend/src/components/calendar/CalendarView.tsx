// frontend/src/components/calendar/CalendarView.tsx
import { useEffect, useMemo, useState } from "react";
import { Logo } from "../shared/Logo";
import { Navigation } from "../shared/Navigation";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react";
import { apiFetch, apiUrl } from "../../lib/api";

type PrayerTimes = {
  fajr: string;
  sunrise: string;
  dhuhr: string;
  asr: string;
  maghrib: string;
  isha: string;
};

type DayEntry = {
  date: string; // YYYY-MM-DD
  source: "calculation" | "mosque" | string;
  prayers: PrayerTimes;
};

type CalendarResponse = {
  location: { city: string; country: string };
  month: string; // YYYY-MM
  days: DayEntry[];
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function monthKeyFromDate(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

function buildDate(y: number, mIndex: number, day: number) {
  return new Date(y, mIndex, day, 12, 0, 0); // noon avoids DST edge cases
}

function isoDate(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export default function CalendarView() {
  const today = useMemo(() => new Date(), []);
  const [activeMonth, setActiveMonth] = useState<Date>(new Date(today.getFullYear(), today.getMonth(), 1));
  const [data, setData] = useState<CalendarResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const todayStr = useMemo(() => isoDate(today), [today]);
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);

  const monthKey = useMemo(() => monthKeyFromDate(activeMonth), [activeMonth]);

  const dayMap = useMemo(() => {
    const map = new Map<string, DayEntry>();
    for (const d of data?.days || []) map.set(d.date, d);
    return map;
  }, [data]);

  const selectedDay = dayMap.get(selectedDate) || null;

  // Build a 6x7 calendar grid starting from Sunday of the first week
  const gridDates = useMemo(() => {
    const y = activeMonth.getFullYear();
    const m = activeMonth.getMonth();
    const firstOfMonth = buildDate(y, m, 1);
    const firstDow = firstOfMonth.getDay(); // 0=Sun
    const start = buildDate(y, m, 1 - firstDow);

    const cells: Date[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      cells.push(d);
    }
    return cells;
  }, [activeMonth]);

  const fetchMonth = async (key: string) => {
    try {
      setLoading(true);
      setError(null);

      const res = await apiFetch(`/api/prayer-times/month?month=${encodeURIComponent(key)}`);
      if (!res.ok) throw new Error(`Failed to load calendar (${res.status})`);

      const json = (await res.json()) as CalendarResponse;
      setData(json);

      // If user switched months, default selectedDate to today if in month, otherwise first day
      const inMonth = json.days.some((d) => d.date === todayStr);
      if (monthKey === key && inMonth) setSelectedDate(todayStr);
      else setSelectedDate(`${key}-01`);
    } catch (err: any) {
      console.error(err);
      setData(null);
      setError(err.message || "Something went wrong while loading calendar.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMonth(monthKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthKey]);

  const goMonth = (offset: number) => {
    const y = activeMonth.getFullYear();
    const m = activeMonth.getMonth();
    setActiveMonth(new Date(y, m + offset, 1));
  };

  const jumpToday = () => {
    setActiveMonth(new Date(today.getFullYear(), today.getMonth(), 1));
    setSelectedDate(todayStr);
  };

  const activeMonthLabel = useMemo(() => {
    return activeMonth.toLocaleString(undefined, { month: "long", year: "numeric" });
  }, [activeMonth]);

  return (
    <div className="min-h-screen bg-slate-950 py-6 px-4 md:px-8">
      <div className="max-w-7xl mx-auto">
        {/* Top nav */}
        <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
          <Logo />
          <Navigation />
        </div>

        {/* Heading */}
        <header className="mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-slate-900 border border-slate-800">
              <CalendarIcon className="text-emerald-400" size={20} />
            </div>
            <div>
              <h1 className="text-white text-2xl md:text-3xl">Prayer Calendar</h1>
              <p className="text-slate-400 text-sm md:text-base">
                Click any day to view prayer times. Use the arrows to navigate months.
              </p>
            </div>
          </div>
        </header>

        {/* Controls */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              className="border-slate-700 text-slate-200"
              onClick={() => goMonth(-1)}
            >
              <ChevronLeft size={18} />
            </Button>
            <div className="px-4 py-2 rounded-2xl bg-slate-900 border border-slate-800 text-slate-100">
              {activeMonthLabel}
            </div>
            <Button
              variant="outline"
              className="border-slate-700 text-slate-200"
              onClick={() => goMonth(1)}
            >
              <ChevronRight size={18} />
            </Button>
          </div>

          <Button
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
            onClick={jumpToday}
          >
            Today
          </Button>
        </div>

        {/* Status */}
        {loading && (
          <div className="text-slate-300 bg-slate-900 border border-slate-800 rounded-2xl p-4 mb-6">
            Loading month…
          </div>
        )}
        {error && (
          <div className="text-red-200 bg-red-950/40 border border-red-900/60 rounded-2xl p-4 mb-6">
            {error}
          </div>
        )}

        <div className="grid lg:grid-cols-[1.1fr_0.9fr] gap-6">
          {/* Month grid */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
            <div className="grid grid-cols-7 gap-2 mb-2 text-xs text-slate-400 px-1">
              {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((d) => (
                <div key={d} className="text-center">{d}</div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-2">
              {gridDates.map((d) => {
                const dIso = isoDate(d);
                const inMonth = d.getMonth() === activeMonth.getMonth();
                const isToday = dIso === todayStr;
                const isSelected = dIso === selectedDate;

                const hasData = dayMap.has(dIso);
                const source = dayMap.get(dIso)?.source;

                const base =
                  "rounded-xl border px-2 py-2 text-sm text-center cursor-pointer select-none";
                const style = [
                  base,
                  inMonth ? "bg-slate-950/30 border-slate-800 text-slate-100" : "bg-slate-950/10 border-slate-900 text-slate-600",
                  isSelected ? "ring-2 ring-emerald-500" : "",
                  isToday ? "border-emerald-500/60" : "",
                ].join(" ");

                return (
                  <div
                    key={dIso}
                    className={style}
                    onClick={() => setSelectedDate(dIso)}
                    title={hasData ? `Source: ${source}` : "No data"}
                  >
                    <div className="font-medium">{d.getDate()}</div>
                    {hasData && (
                      <div className="mt-1 flex justify-center">
                        <Badge className={source === "mosque" ? "bg-emerald-600/20 text-emerald-300 border border-emerald-600/30" : "bg-slate-800/60 text-slate-200 border border-slate-700"}>
                          {source === "mosque" ? "Mosque" : "Calc"}
                        </Badge>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Day details */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
            <h2 className="text-white text-xl mb-1">Day Details</h2>
            <p className="text-slate-400 text-sm mb-4">{selectedDate}</p>

            {!selectedDay ? (
              <div className="text-slate-300">
                No prayer times loaded for this day.
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-slate-300">Source</span>
                  <Badge className={selectedDay.source === "mosque" ? "bg-emerald-600/20 text-emerald-300 border border-emerald-600/30" : "bg-slate-800/60 text-slate-200 border border-slate-700"}>
                    {selectedDay.source === "mosque" ? "Mosque Timetable" : "Calculation"}
                  </Badge>
                </div>

                {([
                  ["Fajr", selectedDay.prayers.fajr],
                  ["Sunrise", selectedDay.prayers.sunrise],
                  ["Dhuhr", selectedDay.prayers.dhuhr],
                  ["Asr", selectedDay.prayers.asr],
                  ["Maghrib", selectedDay.prayers.maghrib],
                  ["Isha", selectedDay.prayers.isha],
                ] as const).map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between bg-slate-950/40 border border-slate-800 rounded-xl px-4 py-3">
                    <span className="text-slate-300">{label}</span>
                    <span className="text-white font-semibold">{value}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
