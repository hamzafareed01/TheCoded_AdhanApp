import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Logo } from "../shared/Logo";
import { ProgressIndicator } from "../shared/ProgressIndicator";
import { Button } from "../ui/button";
import { Checkbox } from "../ui/checkbox";
import { Label } from "../ui/label";
import { Badge } from "../ui/badge";
import { Switch } from "../ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { apiFetch } from "../../lib/api";

type PrayerName = "fajr" | "dhuhr" | "asr" | "maghrib" | "isha";
const PRAYERS: PrayerName[] = ["fajr", "dhuhr", "asr", "maghrib", "isha"];

type Device = { id: string; name: string; platform?: string };
type Reciter = { id: string; name: string; country?: string | null; style?: string | null; type?: string };

type AfterType = "none" | "dua" | "surah";
type AfterAdhan = { type: AfterType; payload: any | null };

type PrayerConfig = {
  prayerName: PrayerName;
  adhanReciterId: string | null;
  afterAdhan: AfterAdhan;
};

type Props = {
  onboardingData: any;
  setOnboardingData: (next: any) => void;
};

function defaultPrayerConfigs(): PrayerConfig[] {
  return PRAYERS.map((p) => ({ prayerName: p, adhanReciterId: null, afterAdhan: { type: "none", payload: null } }));
}

async function saveSettings(payload: any) {
  const put = await apiFetch("/api/user/settings", { method: "PUT", body: JSON.stringify(payload) });
  if (put.ok) return put;
  return apiFetch("/api/user/settings", { method: "POST", body: JSON.stringify(payload) });
}

export default function Step5DevicesAdhan({ onboardingData, setOnboardingData }: Props) {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [accountEnabled, setAccountEnabled] = useState<boolean>(false);

  const [devices, setDevices] = useState<Device[]>([]);
  const [selectedDevices, setSelectedDevices] = useState<string[]>([]);

  const [reciters, setReciters] = useState<Reciter[]>([]);
  const [duas, setDuas] = useState<{ id: string; title: string }[]>([]);
  const [surahs, setSurahs] = useState<{ number: number; nameEnglish: string }[]>([]);

  const [prayerConfigs, setPrayerConfigs] = useState<PrayerConfig[]>(defaultPrayerConfigs());

  const canContinue = useMemo(() => {
    // You can continue even if no devices are selected (user may add later),
    // but we require account enabled and at least one reciter selected across prayers.
    const anyReciter = prayerConfigs.some((p) => !!p.adhanReciterId);
    return accountEnabled && anyReciter && !saving;
  }, [accountEnabled, prayerConfigs, saving]);

  function toggleDevice(id: string) {
    setSelectedDevices((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function updatePrayer(prayerName: PrayerName, patch: Partial<PrayerConfig>) {
    setPrayerConfigs((prev) =>
      prev.map((p) => (p.prayerName === prayerName ? { ...p, ...patch } : p))
    );
  }

  async function loadAll() {
    setLoading(true);
    setError(null);

    const token = localStorage.getItem("amazon_access_token");
    if (!token) {
      setError("Please connect Amazon in Step 2 before configuring devices and Adhan.");
      setLoading(false);
      return;
    }

    try {
      // Load current settings to hydrate UI
      const settingsRes = await apiFetch("/api/user/settings");
      if (settingsRes.ok) {
        const payload = await settingsRes.json();
        const s = payload?.settings ?? payload;
        setAccountEnabled(!!(s.accountEnabled ?? s.account_enabled ?? false));

        if (Array.isArray(s.prayerConfigs)) {
          const next = defaultPrayerConfigs().map((d) => {
            const found = s.prayerConfigs.find((x: any) => (x.prayerName || x.prayer_name) === d.prayerName);
            if (!found) return d;
            return {
              prayerName: d.prayerName,
              adhanReciterId: found.adhanReciterId ?? found.adhan_reciter_id ?? null,
              afterAdhan: found.afterAdhan ?? { type: found.after_type || "none", payload: found.after_payload_json ? JSON.parse(found.after_payload_json) : null }
            };
          });
          setPrayerConfigs(next);
        }
      }

      // Devices (already stored in backend)
      const devRes = await apiFetch("/api/alexa/devices");
      if (devRes.ok) {
        const d = await devRes.json();
        const list = Array.isArray(d) ? d : (Array.isArray(d.devices) ? d.devices : []);
        setDevices(list.map((x: any) => ({ id: String(x.id), name: String(x.name), platform: x.platform })));
      }

      // Reciters
      const recRes = await apiFetch("/api/library/reciters?type=adhan");
      if (recRes.ok) {
        const r = await recRes.json();
        const list = Array.isArray(r) ? r : (Array.isArray(r.reciters) ? r.reciters : []);
        setReciters(list.map((x: any) => ({ id: String(x.id), name: String(x.name), country: x.country ?? null, style: x.style ?? null, type: x.type })));
      } else {
        setError("Reciter library not available. Ensure backend /api/library/reciters is working.");
      }

      // Duas
      const duaRes = await apiFetch("/api/duas");
      if (duaRes.ok) {
        const j = await duaRes.json();
        const flat: { id: string; title: string }[] = [];
        const cats = j?.categories || [];
        for (const c of cats) {
          for (const it of (c.items || [])) {
            flat.push({ id: String(it.id), title: String(it.title) });
          }
        }
        setDuas(flat);
      }

      // Surahs (for after-adhan surah)
      const surRes = await apiFetch("/api/quran/surahs");
      if (surRes.ok) {
        const j = await surRes.json();
        const list = j?.surahs || [];
        setSurahs(list.map((s: any) => ({ number: Number(s.number), nameEnglish: String(s.nameEnglish) })));
      }
    } catch (e: any) {
      setError(e?.message || "Failed to load devices/reciters.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadAll(); }, []);

  const handleNext = async () => {
    setError(null);
    const token = localStorage.getItem("amazon_access_token");
    if (!token) {
      setError("Please connect Amazon in Step 2 before saving.");
      return;
    }

    setSaving(true);
    try {
      // Save account enabled and per-prayer adhan/after-adhan
      const resp = await saveSettings({
        accountEnabled,
        prayerConfigs: prayerConfigs.map((p) => ({
          prayerName: p.prayerName,
          adhanReciterId: p.adhanReciterId,
          afterAdhan: p.afterAdhan
        }))
      });

      if (!resp.ok) {
        const msg = await resp.text().catch(() => "");
        throw new Error(`Could not save settings (${resp.status}). ${msg}`.trim());
      }

      setOnboardingData({
        ...onboardingData,
        devices: selectedDevices,
        accountEnabled,
        prayerConfigs
      });

      navigate("/onboarding/step6");
    } catch (e: any) {
      setError(e?.message || "Could not save device/adhan settings.");
    } finally {
      setSaving(false);
    }
  };

  const tabs = useMemo(() => ["Devices", "Adhan per Prayer"], []);

  return (
    <div className="min-h-screen bg-slate-950 py-8 px-4">
      <div className="max-w-5xl mx-auto">
        <Logo className="mb-8" />
        <ProgressIndicator currentStep={5} totalSteps={6} />

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 md:p-12">
          <div className="flex items-center justify-between gap-4 mb-4">
            <h1 className="text-white text-2xl font-semibold">Devices & Adhan</h1>
            <Badge variant="outline" className="border-emerald-500/30 text-emerald-400">
              Step 5 of 6
            </Badge>
          </div>

          <p className="text-slate-300 mb-6">
            Enable your account, choose devices, and set Adhan + after-Adhan actions per prayer.
          </p>

          {error && (
            <div className="mb-6 text-sm text-red-400 bg-red-950/40 border border-red-900 rounded-md px-3 py-2">
              {error}
            </div>
          )}

          <div className="mb-8 p-6 bg-slate-800/50 rounded-xl border border-slate-700">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-white">Enable account</Label>
                <p className="text-slate-400 text-sm mt-1">
                  Required to activate playback and scheduling features.
                </p>
              </div>
              <Switch checked={accountEnabled} onCheckedChange={(v: boolean) => setAccountEnabled(v)} />
            </div>
          </div>

          <Tabs defaultValue={tabs[0]} className="w-full">
            <TabsList className="bg-slate-800 border-slate-700 w-full justify-start overflow-x-auto flex-nowrap">
              {tabs.map((t) => (
                <TabsTrigger
                  key={t}
                  value={t}
                  className="data-[state=active]:bg-emerald-600 data-[state=active]:text-white"
                >
                  {t}
                </TabsTrigger>
              ))}
            </TabsList>

            <TabsContent value={tabs[0]} className="mt-4">
              {loading ? (
                <p className="text-slate-400 text-sm">Loading devices…</p>
              ) : devices.length === 0 ? (
                <p className="text-slate-300 text-sm">
                  No Alexa devices found yet. You can continue and add devices later (Settings → Devices).
                </p>
              ) : (
                <div className="space-y-3">
                  {devices.map((d) => (
                    <div key={d.id} className="flex items-center gap-4 p-4 bg-slate-800/50 rounded-lg border border-slate-700">
                      <Checkbox
                        id={d.id}
                        checked={selectedDevices.includes(d.id)}
                        onCheckedChange={() => toggleDevice(d.id)}
                      />
                      <Label htmlFor={d.id} className="flex-1 cursor-pointer">
                        <div className="text-white">{d.name}</div>
                        <div className="text-slate-400 text-sm">
                          {d.platform ? d.platform.toUpperCase() : "ALEXA"}
                        </div>
                      </Label>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value={tabs[1]} className="mt-4">
              {reciters.length === 0 ? (
                <p className="text-slate-300 text-sm">
                  Reciters are not available yet. Ensure backend /api/library/reciters works and has data.
                </p>
              ) : (
                <div className="space-y-4">
                  {prayerConfigs.map((pc) => (
                    <div key={pc.prayerName} className="rounded-xl border border-slate-800 p-4">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-slate-100 capitalize">{pc.prayerName}</h3>
                      </div>

                      <div className="grid md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label className="text-slate-200">Adhan reciter</Label>
                          <Select
                            value={pc.adhanReciterId ?? ""}
                            onValueChange={(v) => updatePrayer(pc.prayerName, { adhanReciterId: v })}
                          >
                            <SelectTrigger className="bg-slate-900 border-slate-700 text-slate-100">
                              <SelectValue placeholder="Select reciter" />
                            </SelectTrigger>
                            <SelectContent className="bg-slate-900 border-slate-700">
                              {reciters.map((r) => (
                                <SelectItem key={r.id} value={r.id}>
                                  {r.name}{r.country ? ` · ${r.country}` : ""}{r.style ? ` · ${r.style}` : ""}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <Label className="text-slate-200">After Adhan</Label>
                          <Select
                            value={pc.afterAdhan.type}
                            onValueChange={(v) => updatePrayer(pc.prayerName, { afterAdhan: { type: v as AfterType, payload: null } })}
                          >
                            <SelectTrigger className="bg-slate-900 border-slate-700 text-slate-100">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-slate-900 border-slate-700">
                              <SelectItem value="none">None</SelectItem>
                              <SelectItem value="dua">Dua</SelectItem>
                              <SelectItem value="surah">Surah</SelectItem>
                            </SelectContent>
                          </Select>

                          {pc.afterAdhan.type === "dua" && (
                            <Select
                              value={pc.afterAdhan.payload?.duaId ?? ""}
                              onValueChange={(v) =>
                                updatePrayer(pc.prayerName, { afterAdhan: { type: "dua", payload: { duaId: v } } })
                              }
                            >
                              <SelectTrigger className="bg-slate-900 border-slate-700 text-slate-100">
                                <SelectValue placeholder="Select Dua" />
                              </SelectTrigger>
                              <SelectContent className="bg-slate-900 border-slate-700">
                                {duas.map((d) => (
                                  <SelectItem key={d.id} value={d.id}>
                                    {d.title}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}

                          {pc.afterAdhan.type === "surah" && (
                            <Select
                              value={String(pc.afterAdhan.payload?.surahNumber ?? "")}
                              onValueChange={(v) =>
                                updatePrayer(pc.prayerName, {
                                  afterAdhan: { type: "surah", payload: { surahNumber: Number(v) } },
                                })
                              }
                            >
                              <SelectTrigger className="bg-slate-900 border-slate-700 text-slate-100">
                                <SelectValue placeholder="Select Surah" />
                              </SelectTrigger>
                              <SelectContent className="bg-slate-900 border-slate-700">
                                {surahs.map((s) => (
                                  <SelectItem key={s.number} value={String(s.number)}>
                                    {s.number}. {s.nameEnglish}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>

          <div className="flex gap-4 mt-8">
            <Button
              onClick={() => navigate("/onboarding/step4")}
              variant="outline"
              className="flex-1 border-slate-700 text-slate-300 hover:bg-slate-800"
              disabled={saving}
            >
              Back
            </Button>
            <Button
              onClick={handleNext}
              disabled={!canContinue}
              className="flex-1 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white"
            >
              {saving ? "Saving…" : "Save & Continue"}
            </Button>
          </div>

          {!canContinue && (
            <p className="text-xs text-slate-400 mt-3">
              To continue: enable account and choose at least one Adhan reciter for a prayer.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
