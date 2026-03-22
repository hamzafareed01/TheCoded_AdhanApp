import { BrowserRouter as Router, Navigate, Route, Routes } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";

import Step1Welcome from "./components/onboarding/Step1Welcome";
import Step2ConnectAccounts from "./components/onboarding/Step2ConnectAccounts";
import Step3Location from "./components/onboarding/Step3Location";
import Step4PrayerSettings from "./components/onboarding/Step4PrayerSettings";
import Step5DevicesAdhan from "./components/onboarding/Step5DevicesAdhan";
import Step6Summary from "./components/onboarding/Step6Summary";
import Dashboard from "./components/dashboard/Dashboard";
import MosqueSelector from "./components/mosque/MosqueSelector";
import Settings from "./components/settings/Settings";
import CalendarView from "./components/calendar/CalendarView";
import DuaQuranView from "./components/dua-quran/DuaQuranView";
import QiblahFinder from "./components/qiblah/QiblahFinder";
import AlexaSetup from "./components/alexa/AlexaSetup";

import type { AppUser } from "./types/AppUser";
import {
  apiFetch,
  getStoredAmazonToken,
  restoreAmazonTokenFromUrl,
  subscribeToAmazonAuthChanges,
} from "./lib/api";

type RootShellProps = {
  user?: AppUser | null;
  onLogout: () => void;
};

type JsonRecord = Record<string, unknown>;

type OnboardingState = {
  selectedPlatforms: string[];
  connectedPlatforms: string[];
  tokens: Record<string, string>;
  location: {
    country: string;
    city: string;
    timezone: string;
    latitude?: number;
    longitude?: number;
    useMosqueLocation: boolean;
  };
  prayerSettings: Record<string, unknown>;
  devices: string[];
  prayerConfigs: unknown[];
  accountEnabled: boolean;
  mosque: JsonRecord | null;
};

const STORAGE_KEY = "adhan_onboarding_state_v2";

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getDefaultOnboardingState(): OnboardingState {
  return {
    selectedPlatforms: [],
    connectedPlatforms: [],
    tokens: {},
    location: {
      country: "US",
      city: "",
      timezone: "",
      useMosqueLocation: true,
    },
    prayerSettings: {},
    devices: [],
    prayerConfigs: [],
    accountEnabled: false,
    mosque: null,
  };
}

function readStoredOnboardingState(): OnboardingState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return getDefaultOnboardingState();

    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return getDefaultOnboardingState();

    const base = getDefaultOnboardingState();
    const location = isRecord(parsed.location) ? parsed.location : {};

    return {
      ...base,
      selectedPlatforms: Array.isArray(parsed.selectedPlatforms)
        ? parsed.selectedPlatforms.filter((x): x is string => typeof x === "string")
        : base.selectedPlatforms,
      connectedPlatforms: Array.isArray(parsed.connectedPlatforms)
        ? parsed.connectedPlatforms.filter((x): x is string => typeof x === "string")
        : base.connectedPlatforms,
      tokens: isRecord(parsed.tokens)
        ? Object.fromEntries(
            Object.entries(parsed.tokens).filter(([, v]) => typeof v === "string")
          )
        : base.tokens,
      location: {
        country: asString(location.country) ?? base.location.country,
        city: asString(location.city) ?? base.location.city,
        timezone: asString(location.timezone) ?? base.location.timezone,
        latitude: asNumber(location.latitude) ?? undefined,
        longitude: asNumber(location.longitude) ?? undefined,
        useMosqueLocation:
          typeof location.useMosqueLocation === "boolean"
            ? location.useMosqueLocation
            : base.location.useMosqueLocation,
      },
      prayerSettings: isRecord(parsed.prayerSettings)
        ? parsed.prayerSettings
        : base.prayerSettings,
      devices: Array.isArray(parsed.devices)
        ? parsed.devices.filter((x): x is string => typeof x === "string")
        : base.devices,
      prayerConfigs: Array.isArray(parsed.prayerConfigs)
        ? parsed.prayerConfigs
        : base.prayerConfigs,
      accountEnabled: parsed.accountEnabled === true,
      mosque: isRecord(parsed.mosque) ? parsed.mosque : null,
    };
  } catch {
    return getDefaultOnboardingState();
  }
}

export default function RootShell({ user }: RootShellProps) {
  const [onboardingData, setOnboardingData] = useState<OnboardingState>(() =>
    readStoredOnboardingState()
  );
  const [hasAmazonToken, setHasAmazonToken] = useState<boolean>(() => {
    restoreAmazonTokenFromUrl();
    return !!getStoredAmazonToken();
  });

  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);

  useEffect(() => {
    return subscribeToAmazonAuthChanges(() => {
      restoreAmazonTokenFromUrl();
      setHasAmazonToken(!!getStoredAmazonToken());
    });
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(onboardingData));
  }, [onboardingData]);

  useEffect(() => {
    async function loadUserSettings() {
      if (!hasAmazonToken) return;

      try {
        const res = await apiFetch("/api/user/settings");
        if (!res.ok) return;

        const payload: unknown = await res.json();
        const root = isRecord(payload) ? payload : {};
        const settings = isRecord(root.settings) ? root.settings : root;

        setOnboardingData((prev) => ({
          ...prev,
          connectedPlatforms: Array.from(
            new Set([...prev.connectedPlatforms, "alexa"])
          ),
          location: {
            ...prev.location,
            country: asString(settings.country) ?? prev.location.country,
            city: asString(settings.city) ?? prev.location.city,
            timezone: asString(settings.timezone) ?? prev.location.timezone,
            latitude: asNumber(settings.latitude) ?? prev.location.latitude,
            longitude: asNumber(settings.longitude) ?? prev.location.longitude,
            useMosqueLocation:
              typeof settings.useMosqueLocation === "boolean"
                ? settings.useMosqueLocation
                : prev.location.useMosqueLocation,
          },
          prayerSettings: {
            ...prev.prayerSettings,
            sect: settings.sect ?? prev.prayerSettings.sect,
            shia: settings.shia ?? prev.prayerSettings.shia,
            madhhab: settings.madhhab ?? prev.prayerSettings.madhhab,
            calculationMethod:
              settings.calculationMethod ?? prev.prayerSettings.calculationMethod,
            highLatitudeMode:
              settings.highLatitudeMethod ?? prev.prayerSettings.highLatitudeMode,
            highLatitudeMethod:
              settings.highLatitudeMethod ?? prev.prayerSettings.highLatitudeMethod,
            offsets: settings.globalOffsets ?? prev.prayerSettings.offsets,
          },
          prayerConfigs: Array.isArray(settings.prayerConfigs)
            ? settings.prayerConfigs
            : prev.prayerConfigs,
          devices: Array.isArray(settings.selectedAlexaDeviceIds)
            ? settings.selectedAlexaDeviceIds.filter(
                (x): x is string => typeof x === "string" && x.trim().length > 0
              )
            : prev.devices,
          accountEnabled:
            settings.accountEnabled === true ? true : prev.accountEnabled,
          mosque:
            settings.mosqueId || settings.mosqueName
              ? {
                  id: settings.mosqueId ?? null,
                  name: settings.mosqueName ?? null,
                  address: settings.mosqueAddress ?? null,
                  location:
                    asNumber(settings.mosqueLat) != null &&
                    asNumber(settings.mosqueLng) != null
                      ? {
                          lat: asNumber(settings.mosqueLat),
                          lng: asNumber(settings.mosqueLng),
                        }
                      : null,
                }
              : prev.mosque,
        }));
      } catch (err) {
        console.error("Error loading user settings", err);
      }
    }

    void loadUserSettings();
  }, [hasAmazonToken]);

  const defaultPath = useMemo(() => {
    return hasAmazonToken ? "/dashboard" : "/onboarding/step1";
  }, [hasAmazonToken]);

  return (
    <Router>
      <div className="min-h-screen bg-slate-950">
        <Routes>
          <Route path="/" element={<Navigate to={defaultPath} replace />} />
          <Route
            path="/preview_page_v2.html"
            element={<Navigate to={defaultPath} replace />}
          />

          <Route
            path="/onboarding/step1"
            element={
              <Step1Welcome
                onboardingData={onboardingData}
                setOnboardingData={setOnboardingData}
              />
            }
          />
          <Route
            path="/onboarding/step2"
            element={
              <Step2ConnectAccounts
                onboardingData={onboardingData}
                setOnboardingData={setOnboardingData}
              />
            }
          />
          <Route
            path="/onboarding/step3"
            element={
              <Step3Location
                onboardingData={onboardingData}
                setOnboardingData={setOnboardingData}
              />
            }
          />
          <Route
            path="/onboarding/step4"
            element={
              <Step4PrayerSettings
                onboardingData={onboardingData}
                setOnboardingData={setOnboardingData}
              />
            }
          />
          <Route
            path="/onboarding/step5"
            element={
              <Step5DevicesAdhan
                onboardingData={onboardingData}
                setOnboardingData={setOnboardingData}
              />
            }
          />
          <Route
            path="/onboarding/step6"
            element={
              <Step6Summary
                onboardingData={onboardingData}
                setOnboardingData={setOnboardingData}
              />
            }
          />

          <Route
            path="/dashboard"
            element={<Dashboard onboardingData={onboardingData} user={user} />}
          />
          <Route
            path="/mosque"
            element={
              <MosqueSelector
                onboardingData={onboardingData}
                setOnboardingData={setOnboardingData}
              />
            }
          />
          <Route
            path="/settings"
            element={
              <Settings
                onboardingData={onboardingData}
                setOnboardingData={setOnboardingData}
              />
            }
          />
          <Route path="/alexa-setup" element={<AlexaSetup />} />
          <Route path="/calendar" element={<CalendarView />} />
          <Route path="/dua-quran" element={<DuaQuranView />} />
          <Route path="/qiblah" element={<QiblahFinder />} />

          <Route path="*" element={<Navigate to={defaultPath} replace />} />
        </Routes>
      </div>
    </Router>
  );
}
