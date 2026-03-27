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
    return "bg-emerald-600/20 text-emerald-300 border border-emerald-600/30";
  }
  if (source === "personal") {
    return "bg-cyan-500/15 text-cyan-300 border border-cyan-500/20";
  }
  return "bg-slate-800 text-slate-300 border border-slate-700";
}

function formatDisplayDate(isoDate: string) {
  const d = new Date(`${isoDate}T12:00:00`);
  if (Number.isNaN(d.getTime())) {
    return { title: isoDate, subtitle: "" };
  }

  return {
    title: d.toLocaleDateString(undefined, {
      day: "2-digit",
      month: "long",
      year: "numeric",
    }),
    subtitle: d.toLocaleDateString(undefined, {
      weekday: "short",
    }),
  };
}

export default function CalendarView() {
  const [month, setMonth] = useState(() => monthKeyFromDate(new Date()));
  const [data, setData] = useState<CalendarResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
                <h1 className="text-white text-2xl md:text-3xl font-semibold">
                  Prayer Calendar
                </h1>
              </div>
              <p className="text-slate-300 text-sm md:text-base max-w-3xl">
                Clean monthly timetable view for your active timing source. This is now a prayer chart, not a stacked day-card layout.
              </p>
            </div>
            <Badge className={getSourceBadgeClass(data?.sourceDetail?.actual)}>
              {titleCase(data?.sourceDetail?.actual || "personal")}
            </Badge>
          </div>

          <div className="grid md:grid-cols-4 gap-3 mt-5">
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-3">
              <div className="text-slate-500 text-xs mb-1">Location</div>
              <div className="text-slate-100 font-medium flex items-center gap-2">
                <MapPin className="w-4 h-4 text-emerald-400" />
                {locationLabel}
              </div>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-3">
              <div className="text-slate-500 text-xs mb-1">Sect</div>
              <div className="text-slate-100 font-medium">
                {titleCase(data?.method?.sect || "SUNNI")}
              </div>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-3">
              <div className="text-slate-500 text-xs mb-1">Calculation</div>
              <div className="text-slate-100 font-medium">
                {titleCase(data?.method?.calculationMethod || "isna")}
              </div>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-3">
              <div className="text-slate-500 text-xs mb-1">Timezone</div>
              <div className="text-slate-100 font-medium flex items-center gap-2">
                <Clock3 className="w-4 h-4 text-cyan-400" />
                {data?.location?.timezone || "Etc/UTC"}
              </div>
            </div>
          </div>

          {data?.sourceDetail?.fallbackReason && (
            <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
              {data.sourceDetail.fallbackReason}
            </div>
          )}
        </header>

        <div className="flex items-center gap-3 mb-5 flex-wrap">
          <Button
            variant="outline"
            className="border-slate-700 text-slate-200 hover:bg-slate-800"
            onClick={() => goMonth(-1)}
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <div className="rounded-xl border border-slate-700 bg-slate-900 px-5 py-3 text-lg font-semibold text-white">
            {monthLabel}
          </div>
          <Button
            variant="outline"
            className="border-slate-700 text-slate-200 hover:bg-slate-800"
            onClick={() => goMonth(1)}
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 overflow-hidden">
          {loading ? (
            <div className="px-6 py-10 text-slate-400">Loading calendar…</div>
          ) : error ? (
            <div className="px-6 py-10 text-amber-300">{error}</div>
          ) : !data || data.days.length === 0 ? (
            <div className="px-6 py-10 text-slate-400">No prayer times available for this month.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-[980px] w-full border-collapse text-sm">
                <thead className="bg-slate-900 sticky top-0 z-10">
                  <tr className="border-b border-slate-800">
                    <th className="text-left px-5 py-4 text-slate-200 font-semibold">Date</th>
                    {PRAYER_COLUMNS.map((column) => (
                      <th
                        key={column}
                        className="text-left px-4 py-4 text-slate-200 font-semibold whitespace-nowrap"
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
                        className={`border-b border-slate-800/80 ${
                          isToday ? "bg-emerald-500/5" : "bg-transparent"
                        } hover:bg-slate-800/40 transition-colors`}
                      >
                        <td className="px-5 py-4 align-top">
                          <div className="text-white font-medium">{display.title}</div>
                          <div className="text-slate-500 text-xs mt-1">{display.subtitle}</div>
                        </td>
                        {PRAYER_COLUMNS.map((column) => (
                          <td key={column} className="px-4 py-4 align-top">
                            <div className="text-slate-100 font-medium whitespace-nowrap">
                              {day.prayers[column] || "--:--"}
                            </div>
                            <div className="text-slate-500 text-xs mt-1">
                              {data.location?.timezone || "local"}
                            </div>
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
