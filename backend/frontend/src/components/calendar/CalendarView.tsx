import { useEffect, useMemo, useState } from "react";
import { Logo } from "../shared/Logo";
import { Navigation } from "../shared/Navigation";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Clock3,
  MapPin,
  MoonStar,
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
  location?: {
    city?: string;
    country?: string;
    timezone?: string;
    label?: string;
    latitude?: number | null;
    longitude?: number | null;
  };
  mosque?: {
    id?: string | null;
    name?: string | null;
    address?: string | null;
  };
  method?: {
    sect?: string;
    calculationMethod?: string;
    madhhab?: string;
  };
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

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function monthKeyFromDate(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

function buildDate(y: number, mIndex: number, day: number) {
  return new Date(y, mIndex, day, 12, 0, 0);
}

function isoDate(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function titleCase(value?: string | null) {
  return String(value || "")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase()) || "—";
}

function sourceBadgeClass(source?: string) {
  if (source === "mosque") {
    return "bg-emerald-600/20 text-emerald-300 border border-emerald-600/30";
  }
  if (source === "personal") {
    return "bg-cyan-500/15 text-cyan-300 border border-cyan-500/30";
  }
  return "bg-slate-800/60 text-slate-200 border border-slate-700";
}

export default function CalendarView() {
  const today = useMemo(() => new Date(), []);
  const [activeMonth, setActiveMonth] = useState<Date>(
    new Date(today.getFullYear(), today.getMonth(), 1)
  );
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

  const gridDates = useMemo(() => {
    const y = activeMonth.getFullYear();
    const m = activeMonth.getMonth();
    const firstOfMonth = buildDate(y, m, 1);
    const firstDow = firstOfMonth.getDay();
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

      const res = await apiFetch(
        `/api/prayer-times/month?month=${encodeURIComponent(key)}`
      );

      if (!res.ok) {
        if (res.status === 404) {
          throw new Error(
            "The backend deployed right now does not expose /api/prayer-times/month yet. Deploy the patched backend first."
          );
        }
        throw new Error(`Failed to load calendar (${res.status})`);
      }

      const json = (await res.json()) as CalendarResponse;
      setData(json);

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
    void fetchMonth(monthKey);
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
    return activeMonth.toLocaleString(undefined, {
      month: "long",
      year: "numeric",
    });
  }, [activeMonth]);

  const sourceLabel = data?.sourceDetail?.label || "Prayer calculation";
  const locationLabel = data?.location?.label
    ? data.location.label
    : data?.location?.city
    ? `${data.location.city}${data.location.country ? `, ${data.location.country}` : ""}`
    : "Saved location";

  return (
    <div className="min-h-screen bg-slate-950 py-6 px-4 md:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
          <Logo />
          <Navigation />
        </div>

        <header className="mb-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-slate-900 border border-slate-800">
              <CalendarIcon className="text-emerald-400" size={20} />
            </div>
            <div>
              <h1 className="text-white text-2xl md:text-3xl">Prayer Calendar</h1>
              <p className="text-slate-400 text-sm md:text-base">
                Grid view for advance prayer planning. The month syncs with your
                saved location, sect, offsets, and mosque timing preference.
              </p>
            </div>
          </div>

          <div className="grid md:grid-cols-4 gap-3">
            <div className="rounded-2xl border border-slate-800 bg-slate-900 px-4 py-3">
              <div className="text-slate-500 text-xs mb-1">Timing source</div>
              <div className="text-slate-100 font-medium">{sourceLabel}</div>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-900 px-4 py-3">
              <div className="text-slate-500 text-xs mb-1">Location</div>
              <div className="text-slate-100 font-medium">{locationLabel}</div>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-900 px-4 py-3">
              <div className="text-slate-500 text-xs mb-1">Sect</div>
              <div className="text-slate-100 font-medium">
                {titleCase(data?.method?.sect || "Sunni")}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-900 px-4 py-3">
              <div className="text-slate-500 text-xs mb-1">Method</div>
              <div className="text-slate-100 font-medium">
                {titleCase(data?.method?.calculationMethod || "isna")}
              </div>
            </div>
          </div>

          {data?.sourceDetail?.fallbackReason && (
            <div className="rounded-2xl border border-amber-900/60 bg-amber-950/30 px-4 py-3 text-amber-300 text-sm">
              {data.sourceDetail.fallbackReason}
            </div>
          )}
        </header>

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

        <div className="grid lg:grid-cols-[1.15fr_0.85fr] gap-6">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
            <div className="grid grid-cols-7 gap-2 mb-2 text-xs text-slate-400 px-1">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                <div key={d} className="text-center">
                  {d}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-2">
              {gridDates.map((d) => {
                const dIso = isoDate(d);
                const inMonth = d.getMonth() === activeMonth.getMonth();
                const isToday = dIso === todayStr;
                const isSelected = dIso === selectedDate;
                const entry = dayMap.get(dIso);
                const hasData = !!entry;

                const style = [
                  "rounded-xl border px-2 py-2 text-center cursor-pointer select-none transition-colors min-h-[92px] flex flex-col justify-between",
                  inMonth
                    ? "bg-slate-950/30 border-slate-800 text-slate-100"
                    : "bg-slate-950/10 border-slate-900 text-slate-600",
                  isSelected ? "ring-2 ring-emerald-500" : "",
                  isToday ? "border-emerald-500/60" : "",
                ].join(" ");

                return (
                  <div
                    key={dIso}
                    className={style}
                    onClick={() => setSelectedDate(dIso)}
                    title={hasData ? `Source: ${entry?.source}` : "No data"}
                  >
                    <div>
                      <div className="font-medium">{d.getDate()}</div>
                      {hasData && (
                        <div className="mt-1 flex justify-center">
                          <Badge className={sourceBadgeClass(entry?.source)}>
                            {entry?.source === "mosque"
                              ? "Mosque"
                              : entry?.source === "personal"
                              ? "Personal"
                              : "Calc"}
                          </Badge>
                        </div>
                      )}
                    </div>

                    {hasData && inMonth ? (
                      <div className="hidden md:block mt-2 text-[10px] leading-4 text-slate-300">
                        <div>F {entry?.prayers.fajr}</div>
                        <div>M {entry?.prayers.maghrib}</div>
                      </div>
                    ) : (
                      <div />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
              <h2 className="text-white text-xl mb-1">Day Details</h2>
              <p className="text-slate-400 text-sm mb-4">{selectedDate}</p>

              {!selectedDay ? (
                <div className="text-slate-300">No prayer times loaded for this day.</div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-300">Source</span>
                    <Badge className={sourceBadgeClass(selectedDay.source)}>
                      {titleCase(selectedDay.source)}
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
                    <div
                      key={label}
                      className="flex items-center justify-between bg-slate-950/40 border border-slate-800 rounded-xl px-4 py-3"
                    >
                      <span className="text-slate-300">{label}</span>
                      <span className="text-white font-semibold">{value}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
              <div className="flex items-start gap-3">
                <MapPin className="w-4 h-4 text-emerald-400 mt-1" />
                <div>
                  <div className="text-white text-sm font-medium">Effective location</div>
                  <div className="text-slate-400 text-sm">{locationLabel}</div>
                  {data?.location?.timezone && (
                    <div className="text-slate-500 text-xs mt-1">
                      Timezone: {data.location.timezone}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-start gap-3">
                <MoonStar className="w-4 h-4 text-cyan-400 mt-1" />
                <div>
                  <div className="text-white text-sm font-medium">Prayer method</div>
                  <div className="text-slate-400 text-sm">
                    {titleCase(data?.method?.sect || "Sunni")} · {titleCase(
                      data?.method?.madhhab || "hanafi"
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Clock3 className="w-4 h-4 text-amber-400 mt-1" />
                <div>
                  <div className="text-white text-sm font-medium">Mosque override</div>
                  <div className="text-slate-400 text-sm">
                    {data?.sourceDetail?.useMosqueLocation
                      ? data?.mosque?.name || "Mosque timing preference is on"
                      : "Using personal location timing"}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
