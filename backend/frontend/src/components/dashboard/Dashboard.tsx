import type { LoggedInUser } from '../auth/LoginView';
import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import TestAdhanButton from './TestAdhanButton';
import { Logo } from '../shared/Logo';
import { Navigation } from '../shared/Navigation';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import {
  Settings,
  Volume2,
  CheckCircle,
  Edit,
  Building2,
} from 'lucide-react';

// Use VITE_API_BASE if available, otherwise fall back to localhost
const API_BASE =
  (import.meta as any).env?.VITE_API_BASE ?? 'http://localhost:4000';

const PRAYER_ORDER = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'] as const;

const PRAYER_LABELS: Record<string, string> = {
  fajr: 'Fajr',
  sunrise: 'Sunrise',
  dhuhr: 'Dhuhr',
  asr: 'Asr',
  maghrib: 'Maghrib',
  isha: 'Isha',
};

const platformIcons: any = {
  alexa: '🔵',
  google: '🔴',
  apple: '⚫',
  samsung: '🔵',
  sonos: '⚫',
};

const platformNames: any = {
  alexa: 'Alexa',
  google: 'Google',
  apple: 'Apple',
  samsung: 'Samsung',
  sonos: 'Sonos',
};

type DashboardProps = {
  onboardingData: any;
  user: LoggedInUser;
};

type PrayerMap = {
  [key: string]: string;
};

export default function Dashboard({ onboardingData, user }: DashboardProps) {
  const navigate = useNavigate();

  const [timeToNextPrayer, setTimeToNextPrayer] = useState<string | null>(null);
  const [nextPrayerCode, setNextPrayerCode] = useState<string | null>(null);
  const [nextPrayerTimeDisplay, setNextPrayerTimeDisplay] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [automationOn, setAutomationOn] = useState(true);

  const [todayData, setTodayData] = useState<any | null>(null);
  const [loadingToday, setLoadingToday] = useState<boolean>(true);
  const [todayError, setTodayError] = useState<string | null>(null);

  const [userSettings, setUserSettings] = useState<any | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);

  const connectedPlatforms = onboardingData.connectedPlatforms || [];
  const deviceCount = onboardingData.devices?.length || 0;

  // ---------- Load user settings (quiet hours, mosque selection, etc.) ----------
  useEffect(() => {
    async function loadSettings() {
      try {
        setSettingsError(null);
        const res = await fetch(`${API_BASE}/api/user/settings`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setUserSettings(data);
      } catch (err) {
        console.error('Failed to load user settings:', err);
        setSettingsError('Could not load your automation settings.');
      }
    }
    loadSettings();
  }, []);

  // ---------- Load today's prayer times ----------
  // IMPORTANT: re-fetch when key settings change (mosque/city/method).
  useEffect(() => {
    async function loadToday() {
      try {
        setLoadingToday(true);
        setTodayError(null);

        const res = await fetch(`${API_BASE}/api/prayer-times/today`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data = await res.json();
        setTodayData(data);
      } catch (err) {
        console.error('Failed to load today prayer times:', err);
        setTodayError('Could not load prayer times, showing demo values.');
      } finally {
        setLoadingToday(false);
      }
    }

    loadToday();
  }, [
    userSettings?.mosqueId,
    userSettings?.mosqueLat,
    userSettings?.mosqueLng,
    userSettings?.city,
    userSettings?.country,
    userSettings?.calculationMethod,
  ]);

  const prayers: PrayerMap | null = todayData?.prayers || null;
  const prayerMeta = todayData || null;

  // ---------- Countdown + progress ----------
  useEffect(() => {
    if (!prayers) {
      setTimeToNextPrayer(null);
      setNextPrayerCode(null);
      setNextPrayerTimeDisplay(null);
      setProgress(0);
      return;
    }

    const countdownCodes: (keyof PrayerMap)[] = [
      'fajr',
      'dhuhr',
      'asr',
      'maghrib',
      'isha',
    ];

    const parseTimeToToday = (timeStr: string): Date | null => {
      if (!timeStr) return null;

      // Strip " (CDT)" etc if present
      const raw = String(timeStr).trim();
      const t = raw.replace(/\s*\(.*?\)\s*$/, '').trim();

      // Supports:
      //  - "5:55 AM" / "05:55AM"
      //  - "14:15" / "14:15:00"
      const m12 = t.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AP]M)$/i);
      const m24 = t.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);

      let h: number;
      let m: number;
      let s = 0;

      if (m12) {
        h = Number(m12[1]);
        m = Number(m12[2]);
        s = m12[3] ? Number(m12[3]) : 0;

        const meridian = m12[4].toUpperCase();
        if (meridian === 'AM') {
          if (h === 12) h = 0;
        } else {
          if (h !== 12) h += 12;
        }
      } else if (m24) {
        h = Number(m24[1]);
        m = Number(m24[2]);
        s = m24[3] ? Number(m24[3]) : 0;
      } else {
        return null;
      }

      if ([h, m, s].some((n) => Number.isNaN(n))) return null;

      const d = new Date();
      d.setHours(h, m, s, 0);
      return d;
    };

    const computeNextAndPrev = () => {
      const now = new Date();
      const entries = countdownCodes
        .map((code) => {
          const t = prayers[code];
          const dt = t ? parseTimeToToday(t) : null;
          return dt ? { code, time: dt } : null;
        })
        .filter((e): e is { code: string; time: Date } => e !== null);

      if (entries.length === 0) {
        return { nextCode: null as string | null, nextTime: null as Date | null, prevTime: null as Date | null };
      }

      let idx = entries.findIndex((e) => e.time > now);

      // After Isha → next Fajr tomorrow
      if (idx === -1) {
        const fajrEntry = entries.find((e) => e.code === 'fajr') || entries[0];
        const nextTime = new Date(fajrEntry.time.getTime() + 24 * 60 * 60 * 1000);
        const prevTime = entries[entries.length - 1].time;
        return { nextCode: fajrEntry.code, nextTime, prevTime };
      }

      const nextEntry = entries[idx];
      const prevEntry = idx > 0 ? entries[idx - 1] : null;

      return {
        nextCode: nextEntry.code,
        nextTime: nextEntry.time,
        prevTime: prevEntry?.time ?? null,
      };
    };

    const update = () => {
      const now = new Date();
      const { nextCode, nextTime, prevTime } = computeNextAndPrev();

      if (!nextCode || !nextTime) {
        setTimeToNextPrayer(null);
        setNextPrayerCode(null);
        setNextPrayerTimeDisplay(null);
        setProgress(0);
        return;
      }

      // display time for the next prayer:
      // - normally: prayers[nextCode]
      // - special case: after isha, next is tomorrow fajr → use backend nextFajr if provided
      const isTomorrow =
        nextTime.getFullYear() !== now.getFullYear() ||
        nextTime.getMonth() !== now.getMonth() ||
        nextTime.getDate() !== now.getDate();

      let displayTime = prayers[nextCode] ?? '--:--';
      if (nextCode === 'fajr' && isTomorrow) {
        displayTime = (todayData as any)?.nextFajr ?? displayTime;
      }

      setNextPrayerTimeDisplay(displayTime);

      const diffMs = nextTime.getTime() - now.getTime();
      const hours = Math.max(0, Math.floor(diffMs / 3_600_000));
      const minutes = Math.max(0, Math.floor((diffMs % 3_600_000) / 60_000));
      const seconds = Math.max(0, Math.floor((diffMs % 60_000) / 1000));

      const formatted = [hours, minutes, seconds]
        .map((n) => String(n).padStart(2, '0'))
        .join(':');

      setTimeToNextPrayer(formatted);
      setNextPrayerCode(nextCode);

      if (prevTime) {
        const totalMs = nextTime.getTime() - prevTime.getTime();
        const elapsedMs = now.getTime() - prevTime.getTime();
        const pct = totalMs > 0 ? (elapsedMs / totalMs) * 100 : 0;
        setProgress(Math.min(100, Math.max(0, pct)));
      } else {
        const startOfDay = new Date(now);
        startOfDay.setHours(0, 0, 0, 0);
        const totalMs = nextTime.getTime() - startOfDay.getTime();
        const elapsedMs = now.getTime() - startOfDay.getTime();
        const pct = totalMs > 0 ? (elapsedMs / totalMs) * 100 : 0;
        setProgress(Math.min(100, Math.max(0, pct)));
      }
    };

    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [prayers, todayData]);

  const nextPrayerLabel = nextPrayerCode ? PRAYER_LABELS[nextPrayerCode] : '--';
  const nextPrayerTime = nextPrayerTimeDisplay ?? '--:--';

  const quietHours = userSettings?.quietHours;

  const mosqueFromSettings =
    userSettings && userSettings.mosqueId
      ? {
          id: userSettings.mosqueId,
          name: userSettings.mosqueName ?? onboardingData.mosque?.name ?? undefined,
          address: userSettings.mosqueAddress ?? onboardingData.mosque?.address ?? undefined,
          city: userSettings.city ?? onboardingData.mosque?.city,
          location:
            onboardingData.mosque?.location ??
            (typeof (userSettings as any)?.mosqueLat === 'number' &&
            typeof (userSettings as any)?.mosqueLng === 'number'
              ? { lat: (userSettings as any).mosqueLat, lng: (userSettings as any).mosqueLng }
              : undefined),
        }
      : null;

  const mosque = mosqueFromSettings || onboardingData.mosque || null;

  const locationLabel =
    prayerMeta?.source === 'mosque'
      ? prayerMeta?.mosque?.name || prayerMeta?.location?.city
      : prayerMeta?.location?.city;

  const locationPrefix = prayerMeta?.source === 'mosque' ? 'at' : 'in';

  return (
    <div className="min-h-screen bg-slate-950 py-8 px-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
          <Logo />
          <Navigation />
        </div>

        {/* Welcome Section */}
        <div className="mb-8">
          <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
            <div>
              <h1 className="text-white mb-2">
                Assalamu Alaikum, {user?.name || 'User'}
              </h1>
              <p className="text-slate-400">
                Here are your prayer times for today
                {locationLabel ? ` ${locationPrefix} ${locationLabel}` : ''}
                .
              </p>
              {quietHours && (
                <p className="text-slate-500 text-xs mt-2">
                  Quiet hours:{' '}
                  {quietHours.enabled
                    ? `${quietHours.from}–${quietHours.to}${quietHours.muteFajr ? ' · Fajr muted' : ''}`
                    : 'Off'}
                </p>
              )}
              {settingsError && (
                <p className="text-amber-400 text-xs mt-1">{settingsError}</p>
              )}
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <Badge
                className={`px-3 py-1.5 ${
                  automationOn
                    ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                    : 'bg-slate-700 text-slate-400 border-slate-600'
                }`}
              >
                <div
                  className={`w-2 h-2 rounded-full mr-2 ${
                    automationOn ? 'bg-emerald-400' : 'bg-slate-400'
                  }`}
                />
                Automation: {automationOn ? 'ON' : 'OFF'}
              </Badge>

              <TestAdhanButton />
            </div>
          </div>
          <p className="text-slate-500 text-sm">
            Play a sample Adhan on your selected device. If it&apos;s within
            your quiet hours, we&apos;ll mute it automatically.
          </p>
        </div>

        {/* Main Content Grid */}
        <div className="grid lg:grid-cols-2 gap-6">
          {/* Left Column */}
          <div className="space-y-6">
            {/* Next Prayer Card */}
            <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl">
              <h2 className="text-white mb-4">Next Prayer</h2>
              <div className="mb-4">
                <div className="text-slate-400 mb-2">Next prayer in</div>
                <div className="text-3xl text-emerald-400 mb-4">
                  {timeToNextPrayer ?? '--:--:--'}
                </div>
                <div className="text-white text-xl">
                  {nextPrayerLabel} – {nextPrayerTime}
                </div>
              </div>
              <div className="bg-slate-800 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-emerald-500 to-teal-500 h-full transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>

            {/* Today's Timetable */}
            <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl">
              <h2 className="text-white mb-4">Today&apos;s Timetable</h2>

              {loadingToday && (
                <p className="text-slate-400 text-sm">
                  Loading today&apos;s times…
                </p>
              )}

              {todayError && !loadingToday && (
                <p className="text-amber-400 text-sm mb-3">{todayError}</p>
              )}

              <div className="space-y-3">
                {PRAYER_ORDER.map((code) => {
                  const label = PRAYER_LABELS[code];
                  const time = prayers?.[code] || '--:--';
                  const isNext = code === nextPrayerCode;

                  return (
                    <div
                      key={code}
                      className={`flex items-center justify-between p-3 rounded-lg ${
                        isNext
                          ? 'bg-emerald-500/10 border border-emerald-500/30'
                          : 'bg-slate-800/50'
                      }`}
                    >
                      <span className={isNext ? 'text-emerald-400' : 'text-white'}>
                        {label}
                      </span>
                      <span className={isNext ? 'text-emerald-400' : 'text-slate-300'}>
                        {time}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Right Column */}
          <div className="space-y-6">
            {/* Platforms & Devices */}
            <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl">
              <h2 className="text-white mb-4">Connected platforms</h2>
              <div className="space-y-3 mb-4">
                {connectedPlatforms.map((platform: string) => (
                  <div
                    key={platform}
                    className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{platformIcons[platform]}</span>
                      <span className="text-white">{platformNames[platform]}</span>
                    </div>
                    <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
                      <CheckCircle className="w-3 h-3 mr-1" />
                      Connected
                    </Badge>
                  </div>
                ))}
              </div>
              <div className="text-slate-400 text-sm mb-3">
                {deviceCount} device(s) active for Adhan
              </div>
              <Button
                variant="outline"
                size="sm"
                className="w-full border-slate-700 text-slate-300 hover:bg-slate-800"
                onClick={() => navigate('/settings')}
              >
                Manage connections
              </Button>
            </div>

            {/* Mosque Card */}
            <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl">
              <h2 className="text-white mb-4">Mosque</h2>

              {mosque ? (
                <div className="space-y-2 mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center border border-emerald-500/40">
                      <Building2 className="w-5 h-5 text-emerald-400" />
                    </div>
                    <div className="flex-1">
                      <div className="text-white mb-1">
                        {mosque.name || 'Selected mosque'}
                      </div>
                      <div className="text-slate-400 text-sm">
                        {mosque.address
                          ? mosque.address
                          : mosque.city
                          ? mosque.city
                          : 'Using mosque location from settings'}
                      </div>
                    </div>
                  </div>

                  {prayerMeta && (
                    <p className="text-xs text-slate-500">
                      Source:{' '}
                      {prayerMeta.source === 'mosque'
                        ? 'based on your selected mosque location'
                        : `calculated using method ${prayerMeta.settingsUsed?.method ?? 'ISNA'}`}
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-slate-400 text-sm mb-4">
                  No mosque selected yet. Choose one from the{' '}
                  <Link to="/mosque" className="text-emerald-400 underline">
                    Mosque
                  </Link>{' '}
                  tab.
                </p>
              )}

              {mosque && prayerMeta?.source === 'mosque' && (
                <span className="inline-flex items-center rounded-full border border-emerald-700/60 bg-emerald-900/25 px-3 py-1 text-xs text-emerald-200">
                  Following mosque timings
                </span>
              )}

              <Button
                variant="outline"
                size="sm"
                className="w-full border-slate-700 text-slate-300 hover:bg-slate-800"
                onClick={() => navigate('/mosque')}
              >
                {mosque ? 'Change mosque' : 'Choose a mosque'}
              </Button>
            </div>

            {/* Quick Actions */}
            <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl">
              <h2 className="text-white mb-4">Quick Actions</h2>
              <div className="space-y-3">
                <Button
                  variant="outline"
                  className="w-full border-slate-700 text-slate-300 hover:bg-slate-800 justify-start"
                  onClick={() => navigate('/settings')}
                >
                  <Edit className="w-4 h-4 mr-2" />
                  Edit Prayer Settings
                </Button>
                <Button
                  variant="outline"
                  className="w-full border-slate-700 text-slate-300 hover:bg-slate-800 justify-start"
                  onClick={() => navigate('/settings')}
                >
                  <Settings className="w-4 h-4 mr-2" />
                  Manage Devices & Quiet Hours
                </Button>
                <Button
                  variant="outline"
                  className="w-full border-slate-700 text-slate-300 hover:bg-slate-800 justify-start"
                  onClick={() => setAutomationOn(!automationOn)}
                >
                  <Volume2 className="w-4 h-4 mr-2" />
                  {automationOn ? 'Pause' : 'Resume'} Adhan for Today
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
