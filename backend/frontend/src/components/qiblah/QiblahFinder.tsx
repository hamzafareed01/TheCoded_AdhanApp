import { useMemo, useState } from "react";
import { Logo } from "../shared/Logo";
import { Navigation } from "../shared/Navigation";
import { Button } from "../ui/button";
import { computeQiblah } from "../../lib/qiblah";
import { MapPin, Volume2, Navigation as CompassIcon } from "lucide-react";

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
  const [showManual, setShowManual] = useState(false);

  const canSpeak = useMemo(
    () => typeof window !== "undefined" && "speechSynthesis" in window,
    []
  );

  const computeAndSet = (lat: number, lng: number) => {
    setError(null);
    setPermissionDenied(false);
    const data = computeQiblah(lat, lng);
    setResult(data);
    if (autoAnnounce) {
      const dirLabel = COMPASS_DIRECTION_LABELS[data.direction] || data.direction;
      speak(
        `Qiblah is ${Math.round(data.bearing)} degrees from true north, towards ${dirLabel}.`
      );
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
      computeAndSet(lat, lng);
      setLoading(false);
    } catch (err) {
      setLoading(false);
      const msg = err instanceof Error ? err.message : "Could not get your location.";
      if (
        msg.toLowerCase().includes("denied") ||
        msg.toLowerCase().includes("permission")
      ) {
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
    computeAndSet(lat, lng);
  };

  const handleAnnounce = () => {
    if (!result) return;
    const dirLabel = COMPASS_DIRECTION_LABELS[result.direction] || result.direction;
    speak(
      `Qiblah is ${Math.round(result.bearing)} degrees from true north, towards ${dirLabel}.`
    );
  };

  const bearing = result ? result.bearing : null;
  const hasResult = bearing != null;
  const directionLabel = result
    ? COMPASS_DIRECTION_LABELS[result.direction] || result.direction
    : null;

  return (
    <div
      className="min-h-screen bg-slate-950 overscroll-none"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      {/* Sticky Header */}
      <div className="sticky top-0 z-20 bg-slate-950/90 backdrop-blur-md border-b border-white/5">
        <div className="max-w-7xl mx-auto px-4 py-3 md:px-6">
          <div className="flex items-center justify-between gap-4">
            <Logo />
            <Navigation />
          </div>
        </div>
      </div>

      <div
        className="max-w-7xl mx-auto px-4 py-6 md:px-6 md:py-8"
        style={{ paddingBottom: "calc(2rem + env(safe-area-inset-bottom))" }}
      >
        <div className="max-w-2xl mx-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 md:p-12">
            <h1 className="text-white mb-2 text-center text-2xl font-semibold">
              Qiblah Finder
            </h1>
            <p className="text-slate-400 mb-8 text-center text-sm">
              Direction of the Kaaba from your location
            </p>

            {/* Error */}
            {error && (
              <div className="mb-6 p-4 rounded-2xl border border-red-900/60 bg-red-950/30 text-red-200">
                <p className="mb-1">{error}</p>
                {permissionDenied && (
                  <p className="text-sm text-red-300 mt-1">
                    To enable: go to your phone's{" "}
                    <strong>Settings → Apps → AdhanNow → Permissions → Location</strong>{" "}
                    and allow it, then try again.
                  </p>
                )}
              </div>
            )}

            {/* Compass */}
            <div className="flex items-center justify-center mb-8">
              <div className="relative w-72 h-72 sm:w-80 sm:h-80">
                {/* Outer circle */}
                <div className="absolute inset-0 rounded-full border-4 border-slate-700 bg-gradient-to-br from-slate-800 to-slate-900">
                  {/* Cardinal markers */}
                  <div className="absolute top-4 left-1/2 -translate-x-1/2 text-white text-sm font-semibold">
                    N
                  </div>
                  <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-slate-500 text-sm">
                    S
                  </div>
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 text-sm">
                    W
                  </div>
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 text-sm">
                    E
                  </div>

                  {/* Degree ticks */}
                  {[...Array(12)].map((_, i) => {
                    const angle = i * 30 - 90;
                    const radius = 124;
                    const x = Math.cos((angle * Math.PI) / 180) * radius;
                    const y = Math.sin((angle * Math.PI) / 180) * radius;
                    return (
                      <div
                        key={i}
                        className="absolute w-1 h-3 bg-slate-600"
                        style={{
                          left: "50%",
                          top: "50%",
                          transform: `translate(-50%, -50%) translate(${x}px, ${y}px) rotate(${angle + 90}deg)`,
                        }}
                      />
                    );
                  })}
                </div>

                {/* Inner circle */}
                <div className="absolute inset-8 rounded-full bg-slate-800/50 border-2 border-slate-700" />

                {/* Qiblah arrow — rotates to the real backend bearing */}
                {hasResult ? (
                  <div
                    className="absolute left-1/2 top-1/2 transition-transform duration-700 ease-out"
                    style={{
                      transform: `translate(-50%, -100%) rotate(${bearing}deg)`,
                      transformOrigin: "bottom center",
                    }}
                  >
                    <div className="relative w-0 h-0 border-l-[18px] border-l-transparent border-r-[18px] border-r-transparent border-b-[110px] border-b-emerald-500">
                      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-2 h-20 bg-emerald-400" />
                    </div>
                    <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-emerald-500 text-white px-3 py-1 rounded-full text-sm whitespace-nowrap shadow-lg shadow-emerald-500/30">
                      Qiblah {Math.round(bearing as number)}°
                    </div>
                  </div>
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="flex flex-col items-center gap-2 text-slate-600">
                      <CompassIcon className="w-8 h-8" />
                      <span className="text-xs">No direction yet</span>
                    </div>
                  </div>
                )}

                {/* Center dot */}
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 bg-emerald-500 rounded-full border-2 border-white z-10" />
              </div>
            </div>

            {/* Result summary */}
            {hasResult && (
              <div className="mb-6 p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-center">
                <p className="text-slate-300 text-sm">{result?.message}</p>
                <p className="text-white mt-1">
                  <span className="font-semibold">{Math.round(bearing as number)}°</span>{" "}
                  from true north · {directionLabel}
                </p>
              </div>
            )}

            {/* Primary actions */}
            <div className="space-y-3">
              <Button
                className="w-full bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white min-h-[44px] touch-manipulation"
                onClick={handleUseCurrent}
                disabled={loading}
              >
                <MapPin className="w-4 h-4 mr-2" />
                {loading ? "Locating…" : "Use My Current Location"}
              </Button>

              <button
                type="button"
                onClick={() => setShowManual((v) => !v)}
                className="w-full text-center text-emerald-400 hover:text-emerald-300 text-sm min-h-[44px] touch-manipulation"
              >
                {showManual ? "Hide manual entry" : "Enter coordinates manually"}
              </button>

              {showManual && (
                <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-700 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2.5 text-slate-100 outline-none focus:ring-2 focus:ring-emerald-500 text-base"
                      placeholder="Latitude"
                      inputMode="decimal"
                      value={latInput}
                      onChange={(e) => setLatInput(e.target.value)}
                    />
                    <input
                      className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2.5 text-slate-100 outline-none focus:ring-2 focus:ring-emerald-500 text-base"
                      placeholder="Longitude"
                      inputMode="decimal"
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
              )}

              {hasResult && (
                <div className="flex items-center gap-3">
                  <Button
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white min-h-[44px] touch-manipulation"
                    onClick={handleAnnounce}
                    disabled={!canSpeak}
                  >
                    <Volume2 className="w-4 h-4 mr-2" />
                    Announce
                  </Button>
                  <label className="flex items-center gap-2 text-slate-300 text-sm bg-slate-800/40 border border-slate-700 rounded-xl px-4 min-h-[44px] cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={autoAnnounce}
                      onChange={(e) => setAutoAnnounce(e.target.checked)}
                      className="h-4 w-4 accent-emerald-600"
                    />
                    Auto
                  </label>
                </div>
              )}

              {hasResult && !canSpeak && (
                <p className="text-slate-500 text-xs text-center">
                  Speech is not available on this device.
                </p>
              )}
            </div>

            {/* Calibration instructions */}
            <div className="mt-8 p-6 bg-slate-800/50 border border-slate-700 rounded-xl">
              <h3 className="text-white mb-3 font-medium">How to use</h3>
              <div className="space-y-2 text-slate-300 text-sm">
                <p>1. Tap “Use My Current Location” and allow location access.</p>
                <p>2. The diagram shows North at the top; the green arrow points to the Qiblah bearing from North.</p>
                <p>3. Face North (use your phone's compass app), then turn toward the green arrow to face the Qiblah.</p>
                <p>4. Tap “Announce” to hear the direction read aloud.</p>
              </div>
            </div>

            {/* Location info */}
            <div className="mt-6 p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-lg">
              <div className="text-emerald-400 text-sm mb-1">Current Location</div>
              <div className="text-white">
                {result
                  ? `${result.location.lat.toFixed(5)}, ${result.location.lon.toFixed(5)}`
                  : "Not set — use your location or enter coordinates"}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
