// frontend/src/components/qiblah/QiblahFinder.tsx
import { useState } from "react";
import { Logo } from "../shared/Logo";
import { Navigation } from "../shared/Navigation";
import { Button } from "../ui/button";

type QiblahResult = {
  location: { lat: number; lon: number };
  kaaba: { lat: number; lon: number };
  bearing: number;      // degrees from true north
  direction: string;    // e.g. "NE"
  source: string;
  message: string;
};

export default function QiblahFinder() {
  const [latInput, setLatInput] = useState<string>("");
  const [lngInput, setLngInput] = useState<string>("");

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<QiblahResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const callBackend = async (lat: number, lng: number) => {
    try {
      setLoading(true);
      setError(null);

      const res = await fetch(
        `http://localhost:4000/api/qiblah?lat=${lat}&lng=${lng}`
      );

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

  const handleUseMyLocation = () => {
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

    const lat = parseFloat(latInput);
    const lng = parseFloat(lngInput);

    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      setError("Please enter valid latitude and longitude.");
      return;
    }

    callBackend(lat, lng);
  };

  // Helper for a simple “compass” style dial
  const bearingStyle = result
    ? { transform: `rotate(${result.bearing}deg)` }
    : {};

  return (
    <div className="min-h-screen bg-slate-950 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
          <Logo />
          <Navigation />
        </div>

        <h1 className="text-white text-2xl md:text-3xl mb-2">
          Qiblah Finder
        </h1>
        <p className="text-slate-400 mb-6">
          Find the direction of the Kaaba from your current location.
        </p>

        {/* Controls */}
        <div className="grid md:grid-cols-2 gap-6 mb-8">
          <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl">
            <h2 className="text-white mb-3">Use my current location</h2>
            <p className="text-slate-400 text-sm mb-4">
              We will request browser geolocation, then calculate Qiblah
              direction using the backend.
            </p>
            <Button
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={handleUseMyLocation}
              disabled={loading}
            >
              {loading ? "Detecting location..." : "Use my location"}
            </Button>
          </div>

          <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl">
            <h2 className="text-white mb-3">Enter manually</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-slate-400 text-sm mb-1">
                  Latitude
                </label>
                <input
                  className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  placeholder="e.g. 41.8781"
                  value={latInput}
                  onChange={(e) => setLatInput(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-slate-400 text-sm mb-1">
                  Longitude
                </label>
                <input
                  className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  placeholder="-87.6298"
                  value={lngInput}
                  onChange={(e) => setLngInput(e.target.value)}
                />
              </div>
              <Button
                variant="outline"
                className="w-full border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10"
                onClick={handleUseManual}
                disabled={loading}
              >
                {loading ? "Calculating..." : "Calculate Qiblah"}
              </Button>
            </div>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {/* Result */}
        {result && !error && (
          <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl flex flex-col md:flex-row gap-6">
            <div className="flex-1">
              <h2 className="text-white mb-2">Result</h2>
              <p className="text-slate-400 text-sm mb-4">
                {result.message}
              </p>
              <div className="space-y-2 text-sm text-slate-300">
                <div>
                  <span className="text-slate-400">Bearing: </span>
                  {result.bearing.toFixed(1)}°
                </div>
                <div>
                  <span className="text-slate-400">Direction: </span>
                  {result.direction}
                </div>
                <div>
                  <span className="text-slate-400">Your location: </span>
                  {result.location.lat.toFixed(4)},{" "}
                  {result.location.lon.toFixed(4)}
                </div>
                <div className="text-slate-500 text-xs">
                  Source: {result.source}
                </div>
              </div>
            </div>

            {/* Simple compass */}
            <div className="flex items-center justify-center md:w-56">
              <div className="relative w-40 h-40 rounded-full border border-slate-700 bg-slate-950 flex items-center justify-center">
                {/* Static N/E/S/W markers */}
                <div className="absolute top-2 text-xs text-slate-400">N</div>
                <div className="absolute bottom-2 text-xs text-slate-400">S</div>
                <div className="absolute right-2 text-xs text-slate-400">E</div>
                <div className="absolute left-2 text-xs text-slate-400">W</div>

                {/* Needle */}
                <div
                  className="w-1 h-14 bg-emerald-500 rounded-full origin-bottom transition-transform"
                  style={bearingStyle}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
