import { useEffect, useMemo, useState } from "react";
import { Logo } from "../shared/Logo";
import { Navigation } from "../shared/Navigation";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Switch } from "../ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { apiFetch } from "../../lib/api";

type Sect = "SUNNI" | "SHIA";
type PrayerName = "fajr" | "dhuhr" | "asr" | "maghrib" | "isha";
type Offsets = Record<PrayerName, number>;
type AfterType = "none" | "dua" | "surah";

type PrayerConfig = {
  prayerName: PrayerName;
  enabled: boolean;
  offsetMin: number;
  quietEnabled: boolean;
  quietFrom: string; // HH:MM
  quietTo: string;   // HH:MM
  adhanReciterId: string | null;
  afterAdhan: { type: AfterType; payload: any | null };
};

type UserSettings = {
  sect: Sect;
  language: string;
  madhhab: "hanafi" | "shafi";
  calculationMethod: string;
  highLatitudeMethod: string;

  country: string;
  city: string;
  timezone: string;

  accountEnabled: boolean;
  globalOffsets: Offsets;
  prayerConfigs: PrayerConfig[];
};

type Reciter = { id: string; name: string; country?: string | null; style?: string | null; type?: string };
type DuaItem = { id: string; title: string };
type SurahItem = { number: number; nameEnglish: string };
type Device = { id: string; name: string };

type Schedule = {
  id: string;
  scheduleType: "tilawat";
  timeOfDay: string; // HH:MM
  days: boolean[]; // Sun..Sat
  enabled: boolean;
  deviceId: string | null;
  payload: { surahNumber: number; title?: string | null; reciterId?: string | null };
};

type SettingsProps = {
  onboardingData: any;
  setOnboardingData: (data: any) => void;
};

const PRAYERS: PrayerName[] = ["fajr", "dhuhr", "asr", "maghrib", "isha"];
const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function defaultOffsets(): Offsets {
  return { fajr: 0, dhuhr: 0, asr: 0, maghrib: 0, isha: 0 };
}
function defaultPrayerConfigs(): PrayerConfig[] {
  return PRAYERS.map((p) => ({
    prayerName: p,
    enabled: true,
    offsetMin: 0,
    quietEnabled: false,
    quietFrom: "22:00",
    quietTo: "07:00",
    adhanReciterId: null,
    afterAdhan: { type: "none", payload: null },
  }));
}

function normalizeSettings(payload: any): UserSettings {
  const s = payload?.settings ?? payload ?? {};
  const sect: Sect = (s.sect ?? (s.shia ? "SHIA" : "SUNNI")) as Sect;

  const globalOffsets: Offsets = {
    ...defaultOffsets(),
    ...(s.globalOffsets || s.offsets || {}),
  };

  const pcsIn = Array.isArray(s.prayerConfigs) ? s.prayerConfigs : [];
  const pcs = defaultPrayerConfigs().map((d) => {
    const found = pcsIn.find((x: any) => (x.prayerName || x.prayer_name) === d.prayerName);
    if (!found) return d;
    return {
      prayerName: d.prayerName,
      enabled: !!(found.enabled ?? true),
      offsetMin: Number(found.offsetMin ?? found.offset_min ?? 0),
      quietEnabled: !!(found.quietEnabled ?? found.quiet_enabled ?? false),
      quietFrom: (found.quietFrom ?? found.quiet_from ?? "22:00").slice(0,5),
      quietTo: (found.quietTo ?? found.quiet_to ?? "07:00").slice(0,5),
      adhanReciterId: found.adhanReciterId ?? found.adhan_reciter_id ?? null,
      afterAdhan: found.afterAdhan ?? { type: found.after_type ?? "none", payload: found.after_payload_json ? JSON.parse(found.after_payload_json) : null }
    };
  });

  return {
    sect,
    language: s.language ?? "en",
    madhhab: (s.madhhab ?? "hanafi") === "shafi" ? "shafi" : "hanafi",
    calculationMethod: s.calculationMethod ?? "isna",
    highLatitudeMethod: s.highLatitudeMethod ?? "automatic",
    country: s.country ?? "",
    city: s.city ?? "",
    timezone: s.timezone ?? "",
    accountEnabled: !!(s.accountEnabled ?? s.account_enabled ?? false),
    globalOffsets,
    prayerConfigs: pcs,
  };
}

async function saveSettings(payload: any) {
  const put = await apiFetch("/api/user/settings", { method: "PUT", body: JSON.stringify(payload) });
  if (put.ok) return put;
  return apiFetch("/api/user/settings", { method: "POST", body: JSON.stringify(payload) });
}

export default function Settings({ onboardingData, setOnboardingData }: SettingsProps) {
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [reciters, setReciters] = useState<Reciter[]>([]);
  const [duas, setDuas] = useState<DuaItem[]>([]);
  const [surahs, setSurahs] = useState<SurahItem[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);

  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // schedule form
  const [newTime, setNewTime] = useState("06:30");
  const [newDays, setNewDays] = useState<boolean[]>([true,true,true,true,true,true,true]);
  const [newSurah, setNewSurah] = useState<number>(1);
  const [newTitle, setNewTitle] = useState<string>("");
  const [newReciterId, setNewReciterId] = useState<string>("");
  const [newDeviceId, setNewDeviceId] = useState<string>("");

  const offsetsRows = useMemo(() => PRAYERS, []);

  useEffect(() => {
    async function loadAll() {
      try {
        setError(null);

        const token = localStorage.getItem("amazon_access_token");
        if (!token) {
          setError("Please connect Amazon (Onboarding Step 2) to use Settings.");
          return;
        }

        const sRes = await apiFetch("/api/user/settings");
        if (!sRes.ok) throw new Error(`Failed to load settings (${sRes.status})`);
        const sJson = await sRes.json();
        setSettings(normalizeSettings(sJson));

        // reciters (adhan)
        const rRes = await apiFetch("/api/library/reciters?type=adhan");
        if (rRes.ok) {
          const rJson = await rRes.json();
          const list = Array.isArray(rJson) ? rJson : (rJson.reciters || []);
          setReciters(list.map((x: any) => ({ id: String(x.id), name: String(x.name), country: x.country ?? null, style: x.style ?? null, type: x.type })));
        }

        // duas
        const dRes = await apiFetch("/api/duas");
        if (dRes.ok) {
          const j = await dRes.json();
          const flat: DuaItem[] = [];
          for (const c of (j.categories || [])) {
            for (const it of (c.items || [])) {
              flat.push({ id: String(it.id), title: String(it.title) });
            }
          }
          setDuas(flat);
        }

        // surahs
        const surRes = await apiFetch("/api/quran/surahs");
        if (surRes.ok) {
          const j = await surRes.json();
          setSurahs((j.surahs || []).map((s: any) => ({ number: Number(s.number), nameEnglish: String(s.nameEnglish) })));
        }

        // devices
        const devRes = await apiFetch("/api/alexa/devices");
        if (devRes.ok) {
          const j = await devRes.json();
          const list = Array.isArray(j) ? j : (j.devices || []);
          setDevices(list.map((x: any) => ({ id: String(x.id), name: String(x.name) })));
        }

        // schedules
        await loadSchedules();

      } catch (e: any) {
        setError(e?.message || "Unable to load settings.");
      }
    }

    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadSchedules() {
    const res = await apiFetch("/api/user/schedules");
    if (!res.ok) return;
    const j = await res.json();
    setSchedules((j.schedules || []) as Schedule[]);
  }

  const updateField = <K extends keyof UserSettings>(key: K, value: UserSettings[K]) => {
    if (!settings) return;
    setSettings({ ...settings, [key]: value });
  };

  const updatePrayerConfig = (prayerName: PrayerName, patch: Partial<PrayerConfig>) => {
    if (!settings) return;
    const next = settings.prayerConfigs.map((pc) =>
      pc.prayerName === prayerName ? { ...pc, ...patch } : pc
    );
    setSettings({ ...settings, prayerConfigs: next });
  };

  const handleSave = async () => {
    if (!settings) return;
    setSaving(true);
    setSaveMessage(null);
    setError(null);

    try {
      const payload = {
        ...settings,
        shia: settings.sect === "SHIA",
        offsets: settings.globalOffsets,
      };

      const res = await saveSettings(payload);
      if (!res.ok) {
        const msg = await res.text().catch(() => "");
        throw new Error(`Save failed (${res.status}). ${msg}`.trim());
      }

      setOnboardingData({
        ...onboardingData,
        prayerSettings: {
          ...(onboardingData.prayerSettings || {}),
          sect: settings.sect,
          shia: settings.sect === "SHIA",
          madhhab: settings.madhhab,
          calculationMethod: settings.calculationMethod,
          highLatitudeMode: settings.highLatitudeMethod,
          offsets: settings.globalOffsets,
        }
      });

      setSaveMessage("Settings saved.");
    } catch (e: any) {
      setError(e?.message || "Could not save settings.");
    } finally {
      setSaving(false);
    }
  };

  const toggleDay = (idx: number) => {
    setNewDays((prev) => prev.map((v, i) => (i === idx ? !v : v)));
  };

  const createSchedule = async () => {
    setError(null);
    try {
      const payload = {
        scheduleType: "tilawat",
        timeOfDay: newTime,
        days: newDays,
        enabled: true,
        deviceId: newDeviceId || null,
        payload: {
          surahNumber: newSurah,
          title: newTitle || null,
          reciterId: newReciterId || null,
        },
      };

      const res = await apiFetch("/api/user/schedules", { method: "POST", body: JSON.stringify(payload) });
      if (!res.ok) {
        const msg = await res.text().catch(() => "");
        throw new Error(`Could not create schedule (${res.status}). ${msg}`.trim());
      }
      await loadSchedules();
      setNewTitle("");
    } catch (e: any) {
      setError(e?.message || "Could not create schedule.");
    }
  };

  const deleteSchedule = async (id: string) => {
    setError(null);
    try {
      const res = await apiFetch(`/api/user/schedules/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const msg = await res.text().catch(() => "");
        throw new Error(`Delete failed (${res.status}). ${msg}`.trim());
      }
      await loadSchedules();
    } catch (e: any) {
      setError(e?.message || "Could not delete schedule.");
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 py-8 px-4">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
          <Logo />
          <Navigation />
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-8">
          <div>
            <h1 className="text-white text-xl mb-1">Settings</h1>
            <p className="text-slate-400 text-sm">
              Sect, calculation, offsets, per-prayer Adhan, and schedules.
            </p>
          </div>

          {error && (
            <div className="text-sm text-red-400 bg-red-950/40 border border-red-900 rounded-md px-3 py-2">
              {error}
            </div>
          )}
          {saveMessage && (
            <div className="text-sm text-emerald-400 bg-emerald-950/40 border border-emerald-900 rounded-md px-3 py-2">
              {saveMessage}
            </div>
          )}

          {!settings ? (
            <p className="text-slate-400 text-sm">Loading…</p>
          ) : (
            <>
              {/* Sect + Calculation + Location */}
              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h2 className="text-white text-lg">Sect & Calculation</h2>

                  <div className="space-y-2">
                    <Label className="text-slate-200">Sect</Label>
                    <Select value={settings.sect} onValueChange={(v: string) => updateField("sect", v as Sect)}>
                      <SelectTrigger className="bg-slate-900 border-slate-700 text-slate-100">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-900 border-slate-700">
                        <SelectItem value="SUNNI">Sunni</SelectItem>
                        <SelectItem value="SHIA">Shia</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-slate-200">Madhhab</Label>
                    <Select value={settings.madhhab} onValueChange={(v: string) => updateField("madhhab", v as any)}>
                      <SelectTrigger className="bg-slate-900 border-slate-700 text-slate-100">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-900 border-slate-700">
                        <SelectItem value="hanafi">Hanafi</SelectItem>
                        <SelectItem value="shafi">Shafi</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-slate-200">Calculation method</Label>
                    <Select value={settings.calculationMethod} onValueChange={(v: string) => updateField("calculationMethod", v)}>
                      <SelectTrigger className="bg-slate-900 border-slate-700 text-slate-100">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-900 border-slate-700">
                        <SelectItem value="isna">ISNA (North America)</SelectItem>
                        <SelectItem value="mwl">Muslim World League</SelectItem>
                        <SelectItem value="egypt">Egyptian Survey</SelectItem>
                        <SelectItem value="karachi">Karachi</SelectItem>
                        <SelectItem value="makkah">Makkah</SelectItem>
                        <SelectItem value="ummAlQura">Umm Al-Qura</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-slate-200">High latitude rule</Label>
                    <Select value={settings.highLatitudeMethod} onValueChange={(v: string) => updateField("highLatitudeMethod", v)}>
                      <SelectTrigger className="bg-slate-900 border-slate-700 text-slate-100">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-900 border-slate-700">
                        <SelectItem value="automatic">Automatic</SelectItem>
                        <SelectItem value="middle_of_the_night">Middle of the Night</SelectItem>
                        <SelectItem value="one_seventh">One Seventh</SelectItem>
                        <SelectItem value="angle_based">Angle Based</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="border-t border-slate-800 pt-6">
                    <h3 className="text-white text-lg mb-2">Timing offsets (minutes)</h3>
                    <div className="space-y-3">
                      {offsetsRows.map((p) => (
                        <div key={p} className="flex items-center justify-between gap-4">
                          <Label className="text-slate-200 capitalize">{p}</Label>
                          <Input
                            type="number"
                            className="w-28 bg-slate-900 border-slate-700 text-slate-100"
                            value={settings.globalOffsets[p]}
                            onChange={(e) =>
                              updateField("globalOffsets", {
                                ...settings.globalOffsets,
                                [p]: Number(e.target.value || 0),
                              })
                            }
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="border-t border-slate-800 pt-6">
                    <div className="flex items-center justify-between rounded-lg border border-slate-700 px-4 py-3">
                      <div>
                        <Label className="text-slate-200">Account enabled</Label>
                        <p className="text-xs text-slate-400">Must be enabled for device playback and schedules.</p>
                      </div>
                      <Switch checked={settings.accountEnabled} onCheckedChange={(v: boolean) => updateField("accountEnabled", v)} />
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h2 className="text-white text-lg">Location</h2>

                  <div className="space-y-2">
                    <Label className="text-slate-200">City</Label>
                    <Input className="bg-slate-900 border-slate-700 text-slate-100" value={settings.city} onChange={(e) => updateField("city", e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-slate-200">Country</Label>
                    <Input className="bg-slate-900 border-slate-700 text-slate-100" value={settings.country} onChange={(e) => updateField("country", e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-slate-200">Time zone</Label>
                    <Input className="bg-slate-900 border-slate-700 text-slate-100" value={settings.timezone} onChange={(e) => updateField("timezone", e.target.value)} />
                  </div>
                </div>
              </div>

              {/* Per-prayer controls */}
              <div className="border-t border-slate-800 pt-6">
                <h2 className="text-white text-lg mb-4">Per-prayer controls</h2>

                {settings.prayerConfigs.map((pc) => (
                  <div key={pc.prayerName} className="rounded-xl border border-slate-800 p-4 mb-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-slate-100 capitalize">{pc.prayerName}</h3>
                      <Switch checked={pc.enabled} onCheckedChange={(v: boolean) => updatePrayerConfig(pc.prayerName, { enabled: v })} />
                    </div>

                    <div className="grid md:grid-cols-3 gap-4 mt-4">
                      <div className="space-y-2">
                        <Label className="text-slate-200">Offset (min)</Label>
                        <Input type="number" className="bg-slate-900 border-slate-700 text-slate-100" value={pc.offsetMin}
                          onChange={(e) => updatePrayerConfig(pc.prayerName, { offsetMin: Number(e.target.value || 0) })} />
                      </div>

                      <div className="flex items-center justify-between rounded-lg border border-slate-700 px-4 py-3 mt-6 md:mt-0">
                        <div>
                          <Label className="text-slate-200">Quiet window</Label>
                          <p className="text-xs text-slate-400">Don’t play during this time.</p>
                        </div>
                        <Switch checked={pc.quietEnabled} onCheckedChange={(v: boolean) => updatePrayerConfig(pc.prayerName, { quietEnabled: v })} />
                      </div>

                      {pc.quietEnabled ? (
                        <div className="grid grid-cols-2 gap-3 md:col-span-3">
                          <div className="space-y-2">
                            <Label className="text-slate-200">From</Label>
                            <Input type="time" className="bg-slate-900 border-slate-700 text-slate-100" value={pc.quietFrom}
                              onChange={(e) => updatePrayerConfig(pc.prayerName, { quietFrom: e.target.value })} />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-slate-200">To</Label>
                            <Input type="time" className="bg-slate-900 border-slate-700 text-slate-100" value={pc.quietTo}
                              onChange={(e) => updatePrayerConfig(pc.prayerName, { quietTo: e.target.value })} />
                          </div>
                        </div>
                      ) : null}
                    </div>

                    <div className="grid md:grid-cols-2 gap-4 mt-4 pt-4 border-t border-slate-800">
                      <div className="space-y-2">
                        <Label className="text-slate-200">Adhan reciter</Label>
                        <Select value={pc.adhanReciterId ?? ""} onValueChange={(v) => updatePrayerConfig(pc.prayerName, { adhanReciterId: v })}>
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
                        <Select value={pc.afterAdhan.type} onValueChange={(v) => updatePrayerConfig(pc.prayerName, { afterAdhan: { type: v as AfterType, payload: null } })}>
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
                            onValueChange={(v) => updatePrayerConfig(pc.prayerName, { afterAdhan: { type: "dua", payload: { duaId: v } } })}
                          >
                            <SelectTrigger className="bg-slate-900 border-slate-700 text-slate-100">
                              <SelectValue placeholder="Select Dua" />
                            </SelectTrigger>
                            <SelectContent className="bg-slate-900 border-slate-700">
                              {duas.map((d) => (
                                <SelectItem key={d.id} value={d.id}>{d.title}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}

                        {pc.afterAdhan.type === "surah" && (
                          <Select
                            value={String(pc.afterAdhan.payload?.surahNumber ?? "")}
                            onValueChange={(v) => updatePrayerConfig(pc.prayerName, { afterAdhan: { type: "surah", payload: { surahNumber: Number(v) } } })}
                          >
                            <SelectTrigger className="bg-slate-900 border-slate-700 text-slate-100">
                              <SelectValue placeholder="Select Surah" />
                            </SelectTrigger>
                            <SelectContent className="bg-slate-900 border-slate-700">
                              {surahs.map((s) => (
                                <SelectItem key={s.number} value={String(s.number)}>{s.number}. {s.nameEnglish}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Schedules */}
              <div className="border-t border-slate-800 pt-6">
                <h2 className="text-white text-lg mb-2">Tilawat schedules</h2>
                <p className="text-slate-400 text-sm mb-4">
                  Create schedules (stored in your account). Playback automation depends on Alexa routines; for now this manages your planned schedule list.
                </p>

                <div className="rounded-xl border border-slate-800 p-4 mb-6">
                  <h3 className="text-slate-100 mb-3">Create schedule</h3>

                  <div className="grid md:grid-cols-4 gap-4">
                    <div className="space-y-2">
                      <Label className="text-slate-200">Time</Label>
                      <Input type="time" className="bg-slate-900 border-slate-700 text-slate-100" value={newTime} onChange={(e) => setNewTime(e.target.value)} />
                    </div>

                    <div className="space-y-2">
                      <Label className="text-slate-200">Surah</Label>
                      <Select value={String(newSurah)} onValueChange={(v) => setNewSurah(Number(v))}>
                        <SelectTrigger className="bg-slate-900 border-slate-700 text-slate-100">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-slate-900 border-slate-700 max-h-72 overflow-y-auto">
                          {surahs.map((s) => (
                            <SelectItem key={s.number} value={String(s.number)}>{s.number}. {s.nameEnglish}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-slate-200">Device (optional)</Label>
                      <Select value={newDeviceId} onValueChange={(v) => setNewDeviceId(v)}>
                        <SelectTrigger className="bg-slate-900 border-slate-700 text-slate-100">
                          <SelectValue placeholder="None" />
                        </SelectTrigger>
                        <SelectContent className="bg-slate-900 border-slate-700">
                          <SelectItem value="">None</SelectItem>
                          {devices.map((d) => (
                            <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-slate-200">Reciter (optional)</Label>
                      <Select value={newReciterId} onValueChange={(v) => setNewReciterId(v)}>
                        <SelectTrigger className="bg-slate-900 border-slate-700 text-slate-100">
                          <SelectValue placeholder="Default" />
                        </SelectTrigger>
                        <SelectContent className="bg-slate-900 border-slate-700">
                          <SelectItem value="">Default</SelectItem>
                          {reciters.map((r) => (
                            <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid md:grid-cols-2 gap-4 mt-4">
                    <div className="space-y-2">
                      <Label className="text-slate-200">Title (optional)</Label>
                      <Input className="bg-slate-900 border-slate-700 text-slate-100" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="e.g., Morning Tilawat" />
                    </div>

                    <div className="space-y-2">
                      <Label className="text-slate-200">Days</Label>
                      <div className="flex flex-wrap gap-2">
                        {DAY_LABELS.map((d, i) => (
                          <button
                            key={d}
                            type="button"
                            className={`px-2 py-1 rounded border text-xs ${newDays[i] ? "border-emerald-500 text-emerald-300" : "border-slate-700 text-slate-300"}`}
                            onClick={() => toggleDay(i)}
                          >
                            {d}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4">
                    <Button onClick={createSchedule} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                      Add schedule
                    </Button>
                  </div>
                </div>

                <div className="space-y-3">
                  {schedules.length === 0 ? (
                    <p className="text-slate-400 text-sm">No schedules yet.</p>
                  ) : (
                    schedules.map((s) => (
                      <div key={s.id} className="flex items-center justify-between gap-4 rounded-lg border border-slate-800 p-4">
                        <div>
                          <div className="text-slate-100">
                            {s.payload?.title ? s.payload.title : `Tilawat · Surah ${s.payload.surahNumber}`} · {s.timeOfDay}
                          </div>
                          <div className="text-xs text-slate-400">
                            Days: {s.days.map((on, i) => (on ? DAY_LABELS[i] : null)).filter(Boolean).join(", ")}
                            {s.deviceId ? ` · Device: ${devices.find((d) => d.id === s.deviceId)?.name || s.deviceId}` : ""}
                          </div>
                        </div>
                        <Button variant="outline" className="border-slate-700 text-slate-200" onClick={() => deleteSchedule(s.id)}>
                          Delete
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="flex justify-end pt-4">
                <Button onClick={handleSave} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                  {saving ? "Saving…" : "Save settings"}
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
