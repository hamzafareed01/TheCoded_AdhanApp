// frontend/src/components/dashboard/Dashboard.tsx
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
  MapPin,
  Edit,
  Building2,
} from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:4000';

const PRAYER_ORDER = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'] as const;
// For “next prayer” we don’t want sunrise
const NEXT_PRAYER_ORDER = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'] as const;

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

type NextPrayerInfo = {
  code: string;
  label: string;
  timeStr: string;
};

function parseTimeToDate(baseDateStr: string, timeStr: string): Date | null {
  if (!timeStr) return null;
  const [hStr, mStr] = timeStr.split(':');
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;

  const d = new Date(`${baseDateStr}T00:00:00`);
  d.setHours(h, m, 0, 0);
  return d;
}

function formatDiff(diffMs: number): string {
  if (diffMs <= 0) return '00:00:00';
  let totalSeconds = Math.floor(diffMs / 1000);

  const hours = Math.floor(totalSeconds / 3600);
  totalSeconds -= hours * 3600;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds - minutes * 60;

  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

export default function Dashboard({ onboardingData, user }: DashboardProps) {
  const navigate = useNavigate();

  const [timeToNextPrayer, setTimeToNextPrayer] = useState('00:00:00');
  const [progress, setProgress] = useState(0);
  const [nextPrayer, setNextPrayer] = useState<NextPrayerInfo | null>(null);
  const [automationOn, setAutomationOn] = useState(true);

  const [todayData, setTodayData] = useState<any | null>(null);
  const [loadingToday, setLoadingToday] = useState<boolean>(true);
  const [todayError, setTodayError] = useState<string | null>(null);

  const [userSettings, setUserSettings] = useState<any | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);

  const connectedPlatforms = onboardingData.connectedPlatforms || [];
  const deviceCount = onboardingData.devices?.length || 0;

  // ---- Load today's prayer times ----
  useEffect(() => {
    async function loadToday() {
      try {
        setLoadingToday(true);
        setTodayError(null);

        const res = await fetch(`${API_BASE}/api/prayer-times/today`);
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
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
  }, []);

  // ---- Load user settings (quiet hours + mosque) ----
  useEffect(() => {
    async function loadSettings() {
      try {
        setSettingsError(null);
        const res = await fetch(`${API_BASE}/api/user/settings`);
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const data = await res.json();
        setUserSettings(data);
      } catch (err) {
        console.error('Failed to load user settings:', err);
        setSettingsError('Could not load your automation settings.');
      }
    }

    loadSettings();
  }, []);

  const prayers = todayData?.prayers || null;
  const prayerMeta = todayData || null;
  const quietHours = userSettings?.quietHours;

  const mosqueFromSettings =
    userSettings && userSettings.mosqueId
      ? {
          id: userSettings.mosqueId,
          name:
            userSettings.mosqueName ??
            onboardingData.mosque?.name ??
            undefined,
          address:
            userSettings.mosqueAddress ??
            onboardingData.mosque?.address ??
            undefined,
          city: userSettings.city ?? onboardingData.mosque?.city,
          location: onboardingData.mosque?.location,
        }
      : null;

  const mosque = mosqueFromSettings || onboardingData.mosque || null;

  // ---- Live countdown + progress based on device time ----
  useEffect(() => {
    if (!prayers) return;

    const baseDateStr: string =
      (todayData && todayData.date) || new Date().toISOString().slice(0, 10);

    const updateCountdown = () => {
      const now = new Date();

      let upcoming: {
        code: string;
        label: string;
        timeStr: string;
        diffMs: number;
      } | null = null;
      let lastPrayerDate: Date | null = null;

      for (const code of NEXT_PRAYER_ORDER) {
        const tStr = (prayers as any)[code];
        if (!tStr) continue;

        const prayerDate = parseTimeToDate(baseDateStr, tStr);
        if (!prayerDate) continue;

        const diff = prayerDate.getTime() - now.getTime();

        if (diff >= 0) {
          // future prayer – candidate for "next"
          if (!upcoming || diff < upcoming.diffMs) {
            upcoming = {
              code,
              label: PRAYER_LABELS[code],
              timeStr: tStr,
              diffMs: diff,
            };
          }
        } else {
          // past prayer – keep track of the most recent one
          if (!lastPrayerDate || prayerDate > lastPrayerDate) {
            lastPrayerDate = prayerDate;
          }
        }
      }

      if (!upcoming) {
        // All today's prayers have passed – simple behaviour for now
        setNextPrayer(null);
        setTimeToNextPrayer('00:00:00');
        setProgress(100);
        return;
      }

      // Set next prayer info
      setNextPrayer({
        code: upcoming.code,
        label: upcoming.label,
        timeStr: upcoming.timeStr,
      });
      setTimeToNextPrayer(formatDiff(upcoming.diffMs));

      // Progress between lastPrayerDate -> upcoming
      if (lastPrayerDate) {
        const totalSegmentMs =
          upcoming.diffMs + (now.getTime() - lastPrayerDate.getTime());
        const elapsedSegmentMs = now.getTime() - lastPrayerDate.getTime();

        const pct =
          totalSegmentMs > 0
            ? Math.min(
                100,
                Math.max(0, (elapsedSegmentMs / totalSegmentMs) * 100),
              )
            : 0;
        setProgress(pct);
      } else {
        // Before first prayer of the day – progress from midnight -> first prayer
        const midnight = new Date(`${baseDateStr}T00:00:00`);
        const firstPrayerDate = parseTimeToDate(
          baseDateStr,
          upcoming.timeStr,
        );
        if (!firstPrayerDate) {
          setProgress(0);
          return;
        }

        const totalSegmentMs = firstPrayerDate.getTime() - midnight.getTime();
        const elapsedSegmentMs = now.getTime() - midnight.getTime();

        const pct =
          totalSegmentMs > 0
            ? Math.min(
                100,
                Math.max(0, (elapsedSegmentMs / totalSegmentMs) * 100),
              )
            : 0;
        setProgress(pct);
      }
    };

    updateCountdown(); // initial
    const id = window.setInterval(updateCountdown, 1000);
    return () => window.clearInterval(id);
  }, [prayers, todayData]);

  const nextPrayerLabel = nextPrayer?.label ?? 'Next prayer';
  const nextPrayerTime = nextPrayer?.timeStr ?? '--:--';

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
                {todayData?.location?.city
                  ? ` in ${todayData.location.city}`
                  : ''}
                .
              </p>
              {quietHours && (
                <p className="text-slate-500 text-xs mt-2">
                  Quiet hours:{' '}
                  {quietHours.enabled
                    ? `${quietHours.from}–${quietHours.to}${
                        quietHours.muteFajr ? ' · Fajr muted' : ''
                      }`
                    : 'Off'}
                </p>
              )}
              {settingsError && (
                <p className="text-amber-400 text-xs mt-1">
                  {settingsError}
                </p>
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

              {/* Uses our TestAdhanButton, which handles audio + backend call + quiet hours */}
              <TestAdhanButton />
            </div>
          </div>
          <p className="text-slate-500 text-sm">
            Play a sample Adhan on your selected device. If it&apos;s within your
            quiet hours, we&apos;ll mute it automatically.
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
                  {timeToNextPrayer}
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

            {/* Today's Timetable Card */}
            <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl">
              <h2 className="text-white mb-4">Today's Timetable</h2>

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
                  const isNext = nextPrayer?.code === code;
                  const label = PRAYER_LABELS[code];
                  const time = prayers?.[code] || '--:--';

                  return (
                    <div
                      key={code}
                      className={`flex items-center justify-between p-3 rounded-lg ${
                        isNext
                          ? 'bg-emerald-500/10 border border-emerald-500/30'
                          : 'bg-slate-800/50'
                      }`}
                    >
                      <span
                        className={isNext ? 'text-emerald-400' : 'text-white'}
                      >
                        {label}
                      </span>
                      <span
                        className={
                          isNext ? 'text-emerald-400' : 'text-slate-300'
                        }
                      >
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
            {/* Platforms & Devices Card */}
            <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl">
              <h2 className="text-white mb-4">Connected platforms</h2>
              <div className="space-y-3 mb-4">
                {connectedPlatforms.map((platform: string) => (
                  <div
                    key={platform}
                    className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">
                        {platformIcons[platform]}
                      </span>
                      <span className="text-white">
                        {platformNames[platform]}
                      </span>
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
                          : mosque.location
                          ? `${mosque.location.lat?.toFixed(
                              3,
                            )}, ${mosque.location.lng?.toFixed(3)}`
                          : 'Using mosque location from settings'}
                      </div>
                    </div>
                  </div>

                  {prayerMeta && (
                    <p className="text-xs text-slate-500">
                      Source:{' '}
                      {prayerMeta.source === 'mosque'
                        ? 'official mosque timetable'
                        : `calculated using method ${
                            prayerMeta.settingsUsed?.method ?? 'ISNA'
                          }`}
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

              {mosque && (
                <Badge
                  variant="outline"
                  className="border-emerald-500/30 text-emerald-400 mb-4"
                >
                  Following mosque timings
                </Badge>
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

            {/* Quick Actions Card */}
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
