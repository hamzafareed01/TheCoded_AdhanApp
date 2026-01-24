// frontend/src/components/qiblah/QiblahFinder.tsx
import { useEffect, useMemo, useState } from "react";
import { Logo } from "../shared/Logo";
import { Navigation } from "../shared/Navigation";
import { Button } from "../ui/button";
import { apiFetch } from "../../lib/api";

type QiblahResult = {
  location: { lat: number; lon: number };
  kaaba: { lat: number; lon: number };
  bearing: number; // degrees from true north
  direction: string; // e.g. "NE"
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

export default function QiblahFinder() {
  const [result, setResult] = useState<QiblahResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [latInput, setLatInput] = useState("");
  const [lngInput, setLngInput] = useState("");

  const [autoAnnounce, setAutoAnnounce] = useState(false);

  const canSpeak = useMemo(() => typeof window !== "undefined" && "speechSynthesis" in window, []);

  useEffect(() => {
    if (autoAnnounce && result) {
      speak(`Qiblah is ${Math.round(result.bearing)} degrees from true north, towards ${result.direction}.`);
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

  const handleUseCurrent = () => {
    setError(null);
    setResult(null);

    if (!("geolocation" in navigator)) {
      setError("Geolocation is not available in this browser.");
      return;
    }

    setLoading(true);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setLatInput(lat.toString());
        setLngInput(lng.toString());
        callBackend(lat, lng);
      },
      (err) => {
        console.error(err);
        setLoading(false);
        setError("Could not get your location. Please allow location access.");
      }
    );
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

    callBackend(lat, lng);
  };

  const handleAnnounce = () => {
    if (!result) return;
    speak(`Qiblah is ${Math.round(result.bearing)} degrees from true north, towards ${result.direction}.`);
  };

  return (
    <div className="min-h-screen bg-slate-950 py-6 px-4 md:px-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
          <Logo />
          <Navigation />
        </div>

        <header className="mb-6">
          <h1 className="text-white text-2xl md:text-3xl mb-2">Qiblah Finder</h1>
          <p className="text-slate-400">
            Find the direction of the Kaaba from your current location, or enter coordinates manually.
          </p>
        </header>

        {error && (
          <div className="mb-6 p-4 rounded-2xl border border-red-900/60 bg-red-950/30 text-red-200">
            {error}
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-6 mb-8">
          <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl">
            <h2 className="text-white mb-3">Use my current location</h2>
            <p className="text-slate-400 text-sm mb-4">
              We will request browser geolocation, then calculate Qiblah direction using the backend.
            </p>
            <Button
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={handleUseCurrent}
              disabled={loading}
            >
              {loading ? "Locating…" : "Use Current Location"}
            </Button>
          </div>

          <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl">
            <h2 className="text-white mb-3">Enter coordinates</h2>
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
              className="w-full bg-slate-200 hover:bg-white text-slate-900"
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
                <h3 className="text-white text-xl mb-1">Result</h3>
                <p className="text-slate-300">{result.message}</p>
                <p className="text-slate-400 text-sm mt-2">
                  Bearing: <span className="text-slate-100 font-semibold">{Math.round(result.bearing)}°</span> • Direction:{" "}
                  <span className="text-slate-100 font-semibold">{result.direction}</span>
                </p>
              </div>

              <div className="flex flex-col gap-3 min-w-[220px]">
                <Button
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
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
