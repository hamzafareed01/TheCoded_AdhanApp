// frontend/src/components/qiblah/QiblahFinder.tsx
import { useEffect, useMemo, useState } from "react";
import { Logo } from "../shared/Logo";
import { Navigation } from "../shared/Navigation";
import { Button } from "../ui/button";
import { Capacitor } from "@capacitor/core";
import { apiFetch } from "../../lib/api";

type QiblahResult = {
  location: { lat: number; lon: number };
  kaaba: { lat: number; lon: number };
  bearing: number;
  direction: string;
  source: string;
  message: string;
};

function speak(text: string) {
  try {
    const synth = window.speechSynthesis;
    if (!synth) return;
    synth.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    synth.speak(utter);
  } catch {
    // ignore
  }
}

async function requestLocationPermission(): Promise<boolean> {
  // On native Android/iOS, use Capacitor Geolocation plugin if available
  if (Capacitor.isNativePlatform()) {
    try {
      // Dynamically import to avoid errors if plugin isn't installed
      const { Geolocation } = await import("@capacitor/geolocation");
      const status = await Geolocation.requestPermissions();
      return status.location === "granted" || status.coarseLocation === "granted";
    } catch {
      // Plugin not available — fall through to navigator.geolocation
      return true;
    }
  }
  // On web, navigator.geolocation handles its own permission dialog
  return true;
}

async function getCurrentPosition(): Promise<{ lat: number; lng: number }> {
  // On native, prefer Capacitor Geolocation for reliable Android permission flow
  if (Capacitor.isNativePlatform()) {
    try {
      const { Geolocation } = await import("@capacitor/geolocation");
      const pos = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 15000,
      });
      return {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
      };
    } catch {
      // Fall through to navigator.geolocation
    }
  }

  // Web fallback
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new Error("Geolocation is not available in this browser."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          reject(new Error("Location permission denied. Please enable location access in your device settings and try again."));
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          reject(new Error("Location unavailable. Please check that location services are enabled."));
        } else {
          reject(new Error("Could not get your location. Please try again or enter coordinates manually."));
        }
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  });
}

export default function QiblahFinder() {
  const [result, setResult] = useState<QiblahResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);

  const [latInput, setLatInput] = useState("");
  const [lngInput, setLngInput] = useState("");

  const [autoAnnounce, setAutoAnnounce] = useState(false);

  const COMPASS_DIRECTION_LABELS: Record<string, string> = {
    N: "North",
    NE: "North East",
    E: "East",
    SE: "South East",
    S: "South",
    SW: "South West",
    W: "West",
    NW: "North West",
  };

  const canSpeak = useMemo(() => typeof window !== "undefined" && "speechSynthesis" in window, []);

  useEffect(() => {
    if (autoAnnounce && result) {
      const dirLabel = COMPASS_DIRECTION_LABELS[result.direction] || result.direction;
      speak(`Qiblah is ${Math.round(result.bearing)} degrees from true north, towards ${dirLabel}.`);
    }
  }, [autoAnnounce, result]);

  const callBackend = async (lat: number, lng: number) => {
    try {
      setLoading(true);
      setError(null);

      const res = await apiFetch(`/api/qiblah?lat=${lat}&lng=${lng}`);

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to fetch Qiblah direction");
      }

      const data: QiblahResult = await res.json();
      setResult(data);
    } catch (err: any) {
      console.error(err);
      setResult(null);
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const handleUseCurrent = async () => {
    setError(null);
    setResult(null);
    setPermissionDenied(false);
    setLoading(true);

    try {
      const granted = await requestLocationPermission();
      if (!granted) {
        setPermissionDenied(true);
        setError("Location permission is required to find the Qiblah direction. Please enable location access in your device settings.");
        setLoading(false);
        return;
      }

      const { lat, lng } = await getCurrentPosition();
      setLatInput(lat.toString());
      setLngInput(lng.toString());
      await callBackend(lat, lng);
    } catch (err: any) {
      console.error(err);
      setLoading(false);
      if (err.message?.includes("denied") || err.message?.includes("permission")) {
        setPermissionDenied(true);
      }
      setError(err.message || "Could not get your location.");
    }
  };

  const handleUseManual = () => {
    setError(null);
    setResult(null);

    const lat = Number(latInput);
    const lng = Number(lngInput);

    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      setError("Please enter valid latitude and longitude.");
      return;
    }

    void callBackend(lat, lng);
  };

  const handleAnnounce = () => {
    if (!result) return;
    const dirLabel = COMPASS_DIRECTION_LABELS[result.direction] || result.direction;
    speak(`Qiblah is ${Math.round(result.bearing)} degrees from true north, towards ${dirLabel}.`);
  };

  return (
    <div className="min-h-screen bg-slate-950 overscroll-none" style={{ paddingTop: "env(safe-area-inset-top)" }}>
      <div className="sticky top-0 z-20 bg-slate-950/95 backdrop-blur-sm border-b border-slate-800/50">
        <div className="max-w-7xl mx-auto px-4 py-4 md:px-6">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <Logo />
            <Navigation />
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6 md:px-8" style={{ paddingBottom: "calc(2rem + env(safe-area-inset-bottom))" }}>
        <header className="mb-6">
          <h1 className="text-white text-2xl md:text-3xl mb-2 font-semibold">Qiblah Finder</h1>
          <p className="text-slate-400">
            Find the direction of the Kaaba from your current location, or enter coordinates manually.
          </p>
        </header>

        {error && (
          <div className="mb-6 p-4 rounded-2xl border border-red-900/60 bg-red-950/30 text-red-200">
            <p className="mb-2">{error}</p>
            {permissionDenied && (
              <p className="text-sm text-red-300 mt-1">
                To enable: go to your phone's <strong>Settings → Apps → AdhanNow → Permissions → Location</strong> and allow it, then try again.
              </p>
            )}
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-6 mb-8">
          <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl">
            <h2 className="text-white mb-3 font-medium">Use my current location</h2>
            <p className="text-slate-400 text-sm mb-4">
              AdhanNow will request location permission, then calculate the Qiblah direction automatically.
            </p>
            <Button
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white min-h-[44px] touch-manipulation"
              onClick={handleUseCurrent}
              disabled={loading}
            >
              {loading ? "Locating…" : "Use Current Location"}
            </Button>
          </div>

          <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl">
            <h2 className="text-white mb-3 font-medium">Enter coordinates</h2>
            <p className="text-slate-400 text-sm mb-4">
              Paste latitude/longitude from Maps if you prefer manual entry.
            </p>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <input
                className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-slate-100 outline-none focus:ring-2 focus:ring-emerald-600"
                placeholder="Latitude"
                value={latInput}
                onChange={(e) => setLatInput(e.target.value)}
              />
              <input
                className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-slate-100 outline-none focus:ring-2 focus:ring-emerald-600"
                placeholder="Longitude"
                value={lngInput}
                onChange={(e) => setLngInput(e.target.value)}
              />
            </div>

            <Button
              className="w-full bg-slate-200 hover:bg-white text-slate-900 min-h-[44px] touch-manipulation"
              onClick={handleUseManual}
              disabled={loading}
            >
              {loading ? "Calculating…" : "Find Qiblah"}
            </Button>
          </div>
        </div>

        {result && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <h3 className="text-white text-xl mb-1 font-medium">Result</h3>
                <p className="text-slate-300">{result.message}</p>
                <p className="text-slate-400 text-sm mt-2">
                  Bearing: <span className="text-slate-100 font-semibold">{Math.round(result.bearing)}°</span> · Direction:{" "}
                  <span className="text-slate-100 font-semibold">{COMPASS_DIRECTION_LABELS[result.direction] || result.direction}</span>
                </p>
              </div>

              <div className="flex flex-col gap-3 min-w-[220px]">
                <Button
                  className="bg-emerald-600 hover:bg-emerald-700 text-white min-h-[44px] touch-manipulation"
                  onClick={handleAnnounce}
                  disabled={!canSpeak}
                >
                  Announce Direction
                </Button>

                <label className="flex items-center justify-between gap-3 text-slate-300 text-sm bg-slate-950/40 border border-slate-800 rounded-xl px-4 py-3">
                  <span>Auto-announce</span>
                  <input
                    type="checkbox"
                    checked={autoAnnounce}
                    onChange={(e) => setAutoAnnounce(e.target.checked)}
                    className="h-4 w-4 accent-emerald-600"
                  />
                </label>

                {!canSpeak && (
                  <p className="text-slate-500 text-xs">
                    Speech is not available in this browser/device.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
