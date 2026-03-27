import { useEffect, useMemo, useState } from "react";
import { Logo } from "../shared/Logo";
import { Navigation } from "../shared/Navigation";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Clock3, MapPin } from "lucide-react";
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

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const PRAYER_ORDER: Array<keyof PrayerTimes> = ["fajr", "sunrise", "dhuhr", "asr", "maghrib", "isha"];

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function monthKeyFromDate(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

function isoDate(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function titleCase(value?: string | null) {
  return String(value || "")
    .replace(/([A-Z])/g, " $1")
    .replace(/[_-]+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/\w/g, (c) => c.toUpperCase()) || "—";
}

function getSourceBadgeClass(source?: string) {
  if (source === "mosque") return "bg-emerald-600/20 text-emerald-300 border border-emerald-600/30";
  if (source === "personal") return "bg-cyan-500/15 text-cyan-300 border border-cyan-500/20";
  return "bg-slate-800 text-slate-300 border border-slate-700";
}

export default function CalendarView() {
  const [month, setMonth] = useState(() => monthKeyFromDate(new Date()));
  const [data, setData] = useState<CalendarResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>(() => isoDate(new Date()));

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        setError(null);
        const res = await apiFetch(`/api/prayer-times/month?month=${encodeURIComponent(month)}`);
        if (!res.ok) {
          throw new Error(`Failed to load calendar (${res.status})`);
        }
        const json = (await res.json()) as CalendarResponse;
        setData(json);
        if (!json.days.some((d) => d.date === selectedDate)) {
          setSelectedDate(json.days[0]?.date || selectedDate);
        }
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

  const dayMap = useMemo(() => new Map((data?.days || []).map((d) => [d.date, d])), [data]);

  const gridDays = useMemo(() => {
    const year = currentDate.getFullYear();
    const monthIndex = currentDate.getMonth();
    const first = new Date(year, monthIndex, 1, 12, 0, 0);
    const firstWeekday = first.getDay();
    const start = new Date(year, monthIndex, 1 - firstWeekday, 12, 0, 0);
    return Array.from({ length: 42 }, (_, index) => {
      const d = new Date(start);
      d.setDate(start.getDate() + index);
      return d;
    });
  }, [currentDate]);

  const selectedEntry = dayMap.get(selectedDate) || null;
  const todayIso = isoDate(new Date());
  const locationLabel = data?.sourceDetail?.useMosqueLocation && data?.mosque?.name
    ? data.mosque.name
    : data?.location?.label || [data?.location?.city, data?.location?.country].filter(Boolean).join(", ") || "Saved location";

  const goMonth = (delta: number) => {
    const next = new Date(currentDate);
    next.setMonth(next.getMonth() + delta);
    setMonth(monthKeyFromDate(next));
  };

  return (
    <div className="min-h-screen bg-slate-950 py-8 px-4">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
          <Logo />
          <Navigation />
        </div>

        <header className="mb-6 rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <CalendarIcon className="w-5 h-5 text-emerald-400" />
                <h1 className="text-white text-2xl md:text-3xl font-semibold">Prayer Calendar</h1>
              </div>
              <p className="text-slate-300 text-sm md:text-base max-w-3xl">
                Month view for your saved city or mosque timing source. Click any day to inspect the full prayer timetable.
              </p>
            </div>
            <Badge className={getSourceBadgeClass(data?.sourceDetail?.actual)}>
              {titleCase(data?.sourceDetail?.actual || "personal")}
            </Badge>
          </div>

          <div className="grid md:grid-cols-4 gap-3 mt-5">
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-3">
              <div className="text-slate-500 text-xs mb-1">Location</div>
              <div className="text-slate-100 font-medium flex items-center gap-2"><MapPin className="w-4 h-4 text-emerald-400" />{locationLabel}</div>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-3">
              <div className="text-slate-500 text-xs mb-1">Sect</div>
              <div className="text-slate-100 font-medium">{titleCase(data?.method?.sect || "SUNNI")}</div>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-3">
              <div className="text-slate-500 text-xs mb-1">Calculation</div>
              <div className="text-slate-100 font-medium">{titleCase(data?.method?.calculationMethod || "isna")}</div>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-3">
              <div className="text-slate-500 text-xs mb-1">Madhhab</div>
              <div className="text-slate-100 font-medium">{titleCase(data?.method?.madhhab || "hanafi")}</div>
            </div>
          </div>

          {data?.sourceDetail?.fallbackReason && (
            <div className="mt-4 rounded-xl border border-amber-900/60 bg-amber-950/30 px-4 py-3 text-sm text-amber-300">
              {data.sourceDetail.fallbackReason}
            </div>
          )}
        </header>

        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div className="flex items-center gap-2">
            <Button variant="outline" className="border-slate-700 text-slate-200" onClick={() => goMonth(-1)}>
              <ChevronLeft size={18} />
            </Button>
            <div className="px-4 py-2 rounded-2xl bg-slate-900 border border-slate-800 text-slate-100 font-medium">
              {monthLabel}
            </div>
            <Button variant="outline" className="border-slate-700 text-slate-200" onClick={() => goMonth(1)}>
              <ChevronRight size={18} />
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 text-slate-300">Loading calendar…</div>
        ) : error ? (
          <div className="rounded-2xl border border-red-900/60 bg-red-950/30 p-6 text-red-300">{error}</div>
        ) : (
          <div className="grid lg:grid-cols-[1.15fr_0.85fr] gap-6">
            <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 md:p-5">
              <div className="grid grid-cols-7 gap-2 mb-2 text-xs text-slate-400 px-1">
                {WEEKDAYS.map((day) => (
                  <div key={day} className="py-2 text-center font-medium">{day}</div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-2">
                {gridDays.map((dateObj) => {
                  const iso = isoDate(dateObj);
                  const entry = dayMap.get(iso);
                  const inMonth = dateObj.getMonth() === currentDate.getMonth();
                  const selected = iso === selectedDate;
                  const isToday = iso === todayIso;

                  return (
                    <button
                      key={iso}
                      type="button"
                      onClick={() => entry && setSelectedDate(iso)}
                      className={[
                        "min-h-[108px] rounded-2xl border p-2 text-left transition-all",
                        inMonth ? "bg-slate-950/60" : "bg-slate-950/20 opacity-60",
                        entry ? "border-slate-800 hover:border-emerald-500/40" : "border-slate-900",
                        selected ? "ring-1 ring-emerald-500 border-emerald-500/50" : "",
                      ].join(" ")}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className={isToday ? "text-emerald-300 font-semibold" : inMonth ? "text-slate-100 font-medium" : "text-slate-500"}>
                          {dateObj.getDate()}
                        </span>
                        {entry?.source && (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${getSourceBadgeClass(entry.source)}`}>
                            {entry.source === "mosque" ? "M" : entry.source === "personal" ? "P" : "C"}
                          </span>
                        )}
                      </div>

                      {entry ? (
                        <div className="space-y-1 text-[11px] leading-4">
                          <div className="text-slate-300">Fajr {entry.prayers.fajr}</div>
                          <div className="text-slate-400">Dhuhr {entry.prayers.dhuhr}</div>
                          <div className="text-slate-400">Maghrib {entry.prayers.maghrib}</div>
                        </div>
                      ) : (
                        <div className="text-[11px] text-slate-600">Outside month</div>
                      )}
                    </button>
                  );
                })}
              </div>
            </section>

            <aside className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
              <div className="flex items-center justify-between gap-3 mb-4">
                <div>
                  <div className="text-slate-400 text-sm">Selected day</div>
                  <div className="text-white text-xl font-semibold">{selectedEntry?.date || "—"}</div>
                </div>
                <Badge className={getSourceBadgeClass(selectedEntry?.source)}>
                  {titleCase(selectedEntry?.source || data?.sourceDetail?.actual || "personal")}
                </Badge>
              </div>

              {selectedEntry ? (
                <div className="space-y-3">
                  {PRAYER_ORDER.map((prayer) => (
                    <div key={prayer} className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-3">
                      <div className="text-slate-200 capitalize">{prayer}</div>
                      <div className="flex items-center gap-2 text-slate-100 font-medium"><Clock3 className="w-4 h-4 text-emerald-400" />{selectedEntry.prayers[prayer]}</div>
                    </div>
                  ))}

                  <div className="rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-4 text-sm text-slate-300">
                    <div className="font-medium text-white mb-2">Timing source</div>
                    <div>{data?.sourceDetail?.useMosqueLocation ? data?.mosque?.name || "Mosque timing is preferred" : "Personal location timing is active"}</div>
                  </div>
                </div>
              ) : (
                <div className="text-slate-400 text-sm">Choose a day inside the current month to inspect its prayer times.</div>
              )}
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}
