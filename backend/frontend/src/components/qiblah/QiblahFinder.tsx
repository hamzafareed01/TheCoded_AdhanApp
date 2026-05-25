import { useMemo, useState } from "react";
import { Logo } from "../shared/Logo";
import { Navigation } from "../shared/Navigation";
import { Button } from "../ui/button";
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

function getCurrentPosition(): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new Error("Geolocation is not available in this browser."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          reject(
            new Error(
              "Location permission denied. Please go to Settings → Apps → AdhanNow → Permissions → Location and allow it, then try again."
            )
          );
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          reject(
            new Error(
              "Location unavailable. Please check that location services are enabled on your device."
            )
          );
        } else {
          reject(
            new Error(
              "Could not get your location. Please try again or enter coordinates manually."
            )
          );
        }
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  });
}

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

export default function QiblahFinder() {
  const [result, setResult] = useState<QiblahResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [latInput, setLatInput] = useState("");
  const [lngInput, setLngInput] = useState("");
  const [autoAnnounce, setAutoAnnounce] = useState(false);

  const canSpeak = useMemo(
    () => typeof window !== "undefined" && "speechSynthesis" in window,
    []
  );

  const callBackend = async (lat: number, lng: number) => {
    setLoading(true);
    setError(null);
    setPermissionDenied(false);
    try {
      const res = await apiFetch(`/api/qiblah?lat=${lat}&lng=${lng}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || "Failed to fetch Qiblah direction");
      }
      const data = (await res.json()) as QiblahResult;
      setResult(data);
      if (autoAnnounce) {
        const dirLabel = COMPASS_DIRECTION_LABELS[data.direction] || data.direction;
        speak(`Qiblah is ${Math.round(data.bearing)} degrees from true north, towards ${dirLabel}.`);
      }
    } catch (err) {
      setResult(null);
      setError(err instanceof Error ? err.message : "Something went wrong");
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
      const { lat, lng } = await getCurrentPosition();
      setLatInput(lat.toString());
      setLngInput(lng.toString());
      await callBackend(lat, lng);
    } catch (err) {
      setLoading(false);
      const msg = err instanceof Error ? err.message : "Could not get your location.";
      if (msg.toLowerCase().includes("denied") || msg.toLowerCase().includes("permission")) {
        setPermissionDenied(true);
      }
      setError(msg);
    }
  };

  const handleUseManual = async () => {
    setError(null);
    setResult(null);
    const lat = Number(latInput);
    const lng = Number(lngInput);
    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      setError("Please enter valid latitude and longitude.");
      return;
    }
    await callBackend(lat, lng);
  };

  const handleAnnounce = () => {
    if (!result) return;
    const dirLabel = COMPASS_DIRECTION_LABELS[result.direction] || result.direction;
    speak(`Qiblah is ${Math.round(result.bearing)} degrees from true north, towards ${dirLabel}.`);
  };

  return (
    <div
      className="min-h-screen bg-slate-950 overscroll-none"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <div className="sticky top-0 z-20 bg-slate-950/95 backdrop-blur-sm border-b border-slate-800/50">
        <div className="max-w-7xl mx-auto px-4 py-4 md:px-6">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <Logo />
            <Navigation />
          </div>
        </div>
      </div>

      <div
        className="max-w-6xl mx-auto px-4 py-6 md:px-8"
        style={{ paddingBottom: "calc(2rem + env(safe-area-inset-bottom))" }}
      >
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
                To enable: go to your phone's{" "}
                <strong>Settings → Apps → AdhanNow → Permissions → Location</strong> and allow it,
                then try again.
              </p>
            )}
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-6 mb-8">
          {/* GPS */}
          <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl">
            <h2 className="text-white mb-2 font-medium">Use my current location</h2>
            <p className="text-slate-400 text-sm mb-4">
              AdhanNow will request location permission, then calculate the Qiblah direction
              automatically.
            </p>
            <Button
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white min-h-[44px] touch-manipulation"
              onClick={handleUseCurrent}
              disabled={loading}
            >
              {loading ? "Locating…" : "Use Current Location"}
            </Button>
          </div>

          {/* Manual */}
          <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl">
            <h2 className="text-white mb-2 font-medium">Enter coordinates</h2>
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
                  Bearing:{" "}
                  <span className="text-slate-100 font-semibold">{Math.round(result.bearing)}°</span>{" "}
                  · Direction:{" "}
                  <span className="text-slate-100 font-semibold">
                    {COMPASS_DIRECTION_LABELS[result.direction] || result.direction}
                  </span>
                </p>
              </div>

              <div className="flex flex-col gap-3 min-w-[200px]">
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
