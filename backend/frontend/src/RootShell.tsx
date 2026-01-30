// src/RootShell.tsx
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useState, useEffect } from 'react';

import Step1Welcome from './components/onboarding/Step1Welcome';
import Step2ConnectAccounts from './components/onboarding/Step2ConnectAccounts';
import Step3Location from './components/onboarding/Step3Location';
import Step4PrayerSettings from './components/onboarding/Step4PrayerSettings';
import Step5DevicesAdhan from './components/onboarding/Step5DevicesAdhan';
import Step6Summary from './components/onboarding/Step6Summary';
import Dashboard from './components/dashboard/Dashboard';
import MosqueSelector from './components/mosque/MosqueSelector';
import Settings from './components/settings/Settings';
import CalendarView from './components/calendar/CalendarView';
import DuaQuranView from './components/dua-quran/DuaQuranView';
import QiblahFinder from './components/qiblah/QiblahFinder';
import AlexaSetup from './components/alexa/AlexaSetup';

import type { LoggedInUser } from './components/auth/LoginView';
import { apiFetch } from "./lib/api";

type RootShellProps = {
    user: LoggedInUser;
    onLogout: () => void;
};

export default function RootShell({ user, onLogout }: RootShellProps) {
    // keep this loose for now, we’re still evolving the shape
    const [onboardingData, setOnboardingData] = useState<any>({
        selectedPlatforms: [],
        connectedPlatforms: [],
        location: {
            country: '',
            city: '',
            timezone: '',
            useCurrentLocation: false,
        },
        prayerSettings: {},
        devices: [],
        adhanPreferences: {},
        mosque: null,
    });

    // keep dark mode
    useEffect(() => {
        document.documentElement.classList.add('dark');
    }, []);

    // 🔄 load saved user settings from backend once after login
    useEffect(() => {
        async function loadUserSettings() {
            try {
                const res = await apiFetch("/api/user/settings");
                if (!res.ok) {
                    console.error('Failed to load user settings', res.status);
                    return;
                }

                const settings = await res.json();

                setOnboardingData((prev: any) => ({
                    ...prev,
                    location: {
                        ...prev.location,
                        country: settings.country ?? prev.location.country,
                        city: settings.city ?? prev.location.city,
                        timezone: settings.timezone ?? prev.location.timezone,
                        // we don’t overwrite useCurrentLocation yet
                        useCurrentLocation: prev.location?.useCurrentLocation ?? false,
                    },
                    prayerSettings: {
                        ...(prev.prayerSettings || {}),
                        madhhab: settings.madhhab ?? prev.prayerSettings?.madhhab,
                        shia: settings.shia ?? prev.prayerSettings?.shia,
                        calculationMethod:
                            settings.calculationMethod ?? prev.prayerSettings?.calculationMethod,
                        highLatitudeMethod:
                            settings.highLatitudeMethod ?? prev.prayerSettings?.highLatitudeMethod,
                    },
                    // mosque, devices, etc. can be wired later if we decide to store them in backend
                }));
            } catch (err) {
                console.error('Error loading user settings', err);
            }
        }

        loadUserSettings();
    }, []);

    return (
        <Router>
            <div className="min-h-screen bg-slate-950">
                <Routes>
                    {/* For now, default to onboarding step 1 after login */}
                    <Route path="/" element={<Navigate to="/onboarding/step1" replace />} />

                    <Route
                        path="/preview_page_v2.html"
                        element={<Navigate to="/onboarding/step1" replace />}
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
                    {/* 🔧 pass setOnboardingData into Settings to fix that TS error */}
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

                    <Route path="*" element={<Navigate to="/onboarding/step1" replace />} />
                </Routes>
            </div>
        </Router>
    );
}