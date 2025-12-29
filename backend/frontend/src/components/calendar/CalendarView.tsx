// frontend/src/components/calendar/CalendarView.tsx
import { useEffect, useState } from "react";
import { Logo } from "../shared/Logo";
import { Navigation } from "../shared/Navigation";
import { Badge } from "../ui/badge";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from "lucide-react";

type PrayerTimes = {
  fajr: string;
  sunrise: string;
  dhuhr: string;
  asr: string;
  maghrib: string;
  isha: string;
};

type MosqueMeta = {
  id: string;
  name: string;
  city: string;
  madhhab: string;
  hasRamadanTimetable: boolean;
} | null;

type DayRow = {
  location: { city: string; country: string };
  date: string; // "2025-12-10"
  source: string; // "mosque" | "calculation"
  mosque: MosqueMeta;
  settingsUsed: {
    method: string;
    madhhab: string;
    shia: boolean;
  };
  prayers: PrayerTimes;
};

type CalendarResponse = {
  location: { city: string; country: string };
  month: string; // "2025-12"
  days: DayRow[];
};

export default function CalendarView() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [monthIndex, setMonthIndex] = useState(now.getMonth()); // 0–11

  const [data, setData] = useState<CalendarResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const todayStr = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"

  const buildMonthKey = (y: number, mIndex: number) =>
    `${y}-${String(mIndex + 1).padStart(2, "0")}`; // "YYYY-MM"

  const fetchMonthData = async (monthKey: string) => {
    try {
      setLoading(true);
      setError(null);

      const url = new URL("http://localhost:4000/api/prayer-times/month");
      url.searchParams.set("month", monthKey);

      const res = await fetch(url.toString());
      if (!res.ok) {
        throw new Error(`Failed to load calendar (${res.status})`);
      }

      const json = (await res.json()) as CalendarResponse;
      setData(json);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Something went wrong while loading calendar.");
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  // Load initial month
  useEffect(() => {
    fetchMonthData(buildMonthKey(year, monthIndex));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const changeMonth = (offset: number) => {
    const d = new Date(year, monthIndex + offset, 1);
    const newYear = d.getFullYear();
    const newMonthIndex = d.getMonth();
    setYear(newYear);
    setMonthIndex(newMonthIndex);
    fetchMonthData(buildMonthKey(newYear, newMonthIndex));
  };

  const handlePrevMonth = () => changeMonth(-1);
  const handleNextMonth = () => changeMonth(1);

  const monthLabel = new Date(year, monthIndex, 1).toLocaleDateString(
    undefined,
    { month: "long", year: "numeric" }
  );

  const formatDateLabel = (dateStr: string) => {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      weekday: "short",
    }); // e.g. "Dec 10, Wed"
  };

  return (
    <div className="min-h-screen bg-slate-950 py-8 px-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
          <Logo />
          <Navigation />
        </div>

        <h1 className="text-white text-2xl md:text-3xl mb-2">
          Monthly Prayer Calendar
        </h1>
        <p className="text-slate-400 mb-6 text-sm md:text-base">
          View a full month of prayer times. Rows in{" "}
          <span className="text-emerald-400 font-medium">green</span> are using
          mosque timetables (e.g., Chicago Hilal / local mosque); others use
          the calculation method.
        </p>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-4 mb-6">
          <div className="flex flex-col gap-1">
            <span className="text-slate-400 text-sm">Select month</span>
            <div className="flex items-center gap-3 rounded-full bg-slate-900 border border-slate-700 px-3 py-1.5">
              <button
                type="button"
                onClick={handlePrevMonth}
                className="p-1.5 rounded-full hover:bg-slate-800 text-slate-300"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <div className="flex items-center gap-2">
                <CalendarIcon className="w-4 h-4 text-emerald-400" />
                <span className="text-sm text-slate-100">{monthLabel}</span>
              </div>

              <button
                type="button"
                onClick={handleNextMonth}
                className="p-1.5 rounded-full hover:bg-slate-800 text-slate-300"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {data && (
            <div className="text-slate-400 text-sm">
              Location:{" "}
              <span className="text-slate-200">
                {data.location.city}, {data.location.country}
              </span>
            </div>
          )}
        </div>

        {/* Loading / Error */}
        {loading && (
          <div className="text-slate-300 text-sm mb-4">Loading calendar…</div>
        )}

        {error && (
          <div className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {/* Calendar table */}
        {data && !loading && !error && (
          <div className="overflow-x-auto rounded-2xl bg-slate-900 border border-slate-800">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-900/70">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400">
                    Date
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400">
                    Source
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400">
                    Fajr
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400">
                    Sunrise
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400">
                    Dhuhr
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400">
                    Asr
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400">
                    Maghrib
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400">
                    Isha
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.days.map((day) => {
                  const isToday = day.date === todayStr;
                  const isMosque = day.source === "mosque";

                  const rowClasses = [
                    "border-t border-slate-800",
                    isToday ? "bg-slate-800/40" : "",
                    isMosque ? "bg-emerald-500/5" : "",
                  ]
                    .filter(Boolean)
                    .join(" ");

                  return (
                    <tr key={day.date} className={rowClasses}>
                      <td className="px-4 py-3 whitespace-nowrap text-slate-200">
                        <div className="flex items-center gap-2">
                          <span>{formatDateLabel(day.date)}</span>
                          {isToday && (
                            <Badge className="bg-sky-500/20 text-sky-300 border-sky-500/40 text-[10px]">
                              Today
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-300">
                        {isMosque && day.mosque ? (
                          <div className="flex flex-col">
                            <span className="text-emerald-300 text-xs font-medium">
                              Mosque timetable
                            </span>
                            <span className="text-slate-400 text-[11px]">
                              {day.mosque.name}
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-400 text-xs">
                            Calculation ({day.settingsUsed.method})
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-100">
                        {day.prayers.fajr}
                      </td>
                      <td className="px-4 py-3 text-slate-100">
                        {day.prayers.sunrise}
                      </td>
                      <td className="px-4 py-3 text-slate-100">
                        {day.prayers.dhuhr}
                      </td>
                      <td className="px-4 py-3 text-slate-100">
                        {day.prayers.asr}
                      </td>
                      <td className="px-4 py-3 text-slate-100">
                        {day.prayers.maghrib}
                      </td>
                      <td className="px-4 py-3 text-slate-100">
                        {day.prayers.isha}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {data && !loading && !error && (
          <p className="mt-3 text-xs text-slate-500">
            Note: For now this uses mock data in the backend (with a mosque
            override for a couple of days). Later we’ll connect it to real
            mosque & Hilal committee timetables.
          </p>
        )}
      </div>
    </div>
  );
}
