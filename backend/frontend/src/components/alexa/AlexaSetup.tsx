import { useEffect, useMemo, useState } from "react";
import { Logo } from "../shared/Logo";
import { Navigation } from "../shared/Navigation";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";
import { AlertTriangle, Check, CheckCircle2, Copy, Link2, RefreshCw } from "lucide-react";
import { apiFetch } from "../../lib/api";

type Template = {
  id: string;
  title: string;
  routineName: string;
  phrase: string;
};

type LinkStatus = {
  configured?: boolean;
  appLinkClientConfigured?: boolean;
  linked?: boolean;
  lwaLinked?: boolean;
  expiresAt?: string | null;
  lwaExpiresAt?: string | null;
  lastUsedAt?: string | null;
  invocationName?: string | null;
  skillId?: string | null;
  skillStage?: string | null;
  enablementStatus?: string | null;
  accountLinkStatus?: string | null;
  endpointHost?: string | null;
};

type UserSettingsSummary = {
  selectedAlexaDeviceIds?: string[];
  useMosqueLocation?: boolean;
  mosqueName?: string | null;
  calculationMethod?: string | null;
  madhhab?: string | null;
  sect?: string | null;
  accountEnabled?: boolean;
};

type DeviceListResponse = {
  devices?: Array<{ id: string; name: string; platform?: string | null }>;
};

const FALLBACK_TEMPLATES: Template[] = [
  {
    id: "fajr",
    title: "Fajr Adhan",
    routineName: "Adhan Home – Fajr Adhan",
    phrase: "open adhan home and play fajr adhan",
  },
  {
    id: "dhuhr",
    title: "Dhuhr Adhan",
    routineName: "Adhan Home – Dhuhr Adhan",
    phrase: "open adhan home and play dhuhr adhan",
  },
  {
    id: "asr",
    title: "Asr Adhan",
    routineName: "Adhan Home – Asr Adhan",
    phrase: "open adhan home and play asr adhan",
  },
  {
    id: "maghrib",
    title: "Maghrib Adhan",
    routineName: "Adhan Home – Maghrib Adhan",
    phrase: "open adhan home and play maghrib adhan",
  },
  {
    id: "isha",
    title: "Isha Adhan",
    routineName: "Adhan Home – Isha Adhan",
    phrase: "open adhan home and play isha adhan",
  },
];

function formatDateTime(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

function statusTone(ok: boolean) {
  return ok ? "default" : "secondary";
}

export default function AlexaSetup() {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [templates, setTemplates] = useState<Template[]>(FALLBACK_TEMPLATES);
  const [status, setStatus] = useState<LinkStatus | null>(null);
  const [settings, setSettings] = useState<UserSettingsSummary | null>(null);
  const [deviceNames, setDeviceNames] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const accountLinkPage = useMemo(() => {
    return typeof window !== "undefined"
      ? `${window.location.origin}/onboarding/step2`
      : "/onboarding/step2";
  }, []);

  async function copy(text: string, id: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const el = document.createElement("textarea");
      el.value = text;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
    }
    setCopiedId(id);
    setTimeout(() => setCopiedId((prev) => (prev === id ? null : prev)), 1200);
  }

  async function load() {
    setLoading(true);
    setError(null);

    try {
      const [templatesRes, statusRes, settingsRes, devicesRes] = await Promise.all([
        apiFetch("/api/alexa/routines/templates"),
        apiFetch("/api/alexa/account-linking/status"),
        apiFetch("/api/user/settings"),
        apiFetch("/api/alexa/devices"),
      ]);

      if (templatesRes.ok) {
        const payload = (await templatesRes.json()) as { templates?: Template[] };
        if (Array.isArray(payload.templates) && payload.templates.length > 0) {
          setTemplates(payload.templates);
        }
      }

      if (statusRes.ok) {
        const payload = (await statusRes.json()) as LinkStatus;
        setStatus(payload);
      } else if (statusRes.status === 401) {
        setStatus(null);
        setError("Connect Amazon in onboarding step 2 first, then come back here.");
      }

      if (settingsRes.ok) {
        const payload = (await settingsRes.json()) as { settings?: UserSettingsSummary } & UserSettingsSummary;
        setSettings(payload.settings ?? payload);
      }

      if (devicesRes.ok) {
        const payload = (await devicesRes.json()) as DeviceListResponse;
        const names = Array.isArray(payload.devices)
          ? payload.devices.map((device) => device.name).filter(Boolean)
          : [];
        setDeviceNames(names);
      }
    } catch {
      setError("Could not load Alexa setup details right now.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const selectedDeviceCount = Array.isArray(settings?.selectedAlexaDeviceIds)
    ? settings?.selectedAlexaDeviceIds.length
    : 0;

  const sourceLabel = settings?.useMosqueLocation
    ? settings?.mosqueName || "Mosque timing source"
    : "Personal location / calculation";

  const nextStep = useMemo(() => {
    if (!status?.configured || !status?.appLinkClientConfigured) {
      return "Backend Alexa configuration is incomplete. Check OAuth and app-link environment variables before testing devices.";
    }
    if (!status?.lwaLinked) {
      return "Connect Amazon in onboarding step 2 so the app can save your Alexa link state.";
    }
    if (status?.accountLinkStatus !== "LINKED") {
      return "Enable and link the Alexa skill from onboarding step 2. After linking succeeds, come back here to verify status.";
    }
    if (!selectedDeviceCount) {
      return "Pick at least one Alexa-compatible device in Step 5 or Settings. Devices appear here after AdhanCast sees them once from the live skill.";
    }
    return "Alexa core setup looks healthy. Next: test voice playback on your Echo Dot and Fire TV, then create routines if you want scheduled playback.";
  }, [selectedDeviceCount, status]);

  return (
    <div className="min-h-screen bg-slate-950 py-8 px-4">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <Logo />
            <div>
              <div className="text-slate-100 font-semibold text-lg">Alexa Setup</div>
              <div className="text-slate-400 text-sm">
                Guided Alexa status, routine phrases, durable sign-in, and device-seen playback checks.
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              className="inline-flex items-center gap-2"
              onClick={() => void load()}
              disabled={loading}
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
              Refresh status
            </Button>
            <Navigation />
          </div>
        </div>

        {error ? (
          <div className="mb-6 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
            <div className="inline-flex items-center gap-2 font-medium">
              <AlertTriangle className="w-4 h-4" />
              {error}
            </div>
          </div>
        ) : null}

        <div className="grid lg:grid-cols-3 gap-4 mb-6">
          <Card className="bg-slate-900/40 border-slate-800 lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-slate-100">Current status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-slate-300">
              <div className="flex flex-wrap gap-2">
                <Badge variant={statusTone(!!status?.configured)}>
                  {status?.configured ? "Skill OAuth ready" : "Skill OAuth missing"}
                </Badge>
                <Badge variant={statusTone(!!status?.appLinkClientConfigured)}>
                  {status?.appLinkClientConfigured ? "App link ready" : "App link missing"}
                </Badge>
                <Badge variant={statusTone(!!status?.lwaLinked)}>
                  {status?.lwaLinked ? "Amazon linked" : "Amazon not linked"}
                </Badge>
                <Badge variant={statusTone(status?.accountLinkStatus === "LINKED")}> 
                  {status?.accountLinkStatus === "LINKED" ? "Skill linked" : "Skill not linked"}
                </Badge>
              </div>

              <div className="grid md:grid-cols-2 gap-3">
                <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3">
                  <div className="text-slate-400">Invocation name</div>
                  <div className="text-slate-100 font-medium">{status?.invocationName || "adhan home"}</div>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3">
                  <div className="text-slate-400">Skill stage</div>
                  <div className="text-slate-100 font-medium">{status?.skillStage || "development"}</div>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3">
                  <div className="text-slate-400">Enablement status</div>
                  <div className="text-slate-100 font-medium">{status?.enablementStatus || "Not enabled yet"}</div>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3">
                  <div className="text-slate-400">Account-link status</div>
                  <div className="text-slate-100 font-medium">{status?.accountLinkStatus || "Not linked yet"}</div>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3">
                  <div className="text-slate-400">App-link token expiry</div>
                  <div className="text-slate-100 font-medium">{formatDateTime(status?.lwaExpiresAt)}</div>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3">
                  <div className="text-slate-400">Last Alexa skill use</div>
                  <div className="text-slate-100 font-medium">{formatDateTime(status?.lastUsedAt)}</div>
                </div>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3">
                <div className="text-slate-400">Next recommended step</div>
                <div className="mt-1 text-slate-100">{nextStep}</div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/40 border-slate-800">
            <CardHeader>
              <CardTitle className="text-slate-100">App source of truth</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-slate-300">
              <div>
                Timing source:
                <div className="mt-1 rounded-lg border border-slate-800 bg-slate-950/50 p-2 text-slate-100">
                  {sourceLabel}
                </div>
              </div>
              <div>Sect: <span className="text-slate-100">{settings?.sect || "SUNNI"}</span></div>
              <div>Method: <span className="text-slate-100">{settings?.calculationMethod || "isna"}</span></div>
              <div>Madhhab: <span className="text-slate-100">{settings?.madhhab || "hanafi"}</span></div>
              <div>Playback enabled: <span className="text-slate-100">{settings?.accountEnabled ? "Yes" : "No"}</span></div>
              <div>Selected devices: <span className="text-slate-100">{selectedDeviceCount}</span></div>
              {deviceNames.length ? (
                <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-2 text-xs text-slate-100">
                  {deviceNames.join(", ")}
                </div>
              ) : null}
              <div>
                Step 2 callback URL:
                <div className="mt-1 rounded-lg border border-slate-800 bg-slate-950/50 p-2 font-mono text-xs text-slate-100 break-all">
                  {accountLinkPage}
                </div>
              </div>
              <Button variant="secondary" className="w-full" onClick={() => copy(accountLinkPage, "link-url")}> 
                {copiedId === "link-url" ? (
                  <span className="inline-flex items-center gap-2"><Check className="w-4 h-4" /> Copied</span>
                ) : (
                  <span className="inline-flex items-center gap-2"><Link2 className="w-4 h-4" /> Copy callback URL</span>
                )}
              </Button>
            </CardContent>
          </Card>
        </div>

        <Card className="bg-slate-900/40 border-slate-800">
          <CardHeader>
            <CardTitle className="text-slate-100">How to create a routine</CardTitle>
          </CardHeader>
          <CardContent className="text-slate-200 space-y-2">
            <ol className="list-decimal ml-5 space-y-2">
              <li>Finish Amazon connect + skill linking from onboarding step 2.</li>
              <li>Open the Alexa app, then go to <b>More → Routines → +</b>.</li>
              <li>Pick the correct prayer-time trigger for the routine.</li>
              <li>Choose <b>Add action → Custom</b> and paste one of the phrases below.</li>
              <li>Under <b>From</b>, pick the Echo device that should speak the command.</li>
              <li>Save, then run the routine once manually before relying on it daily.</li>
            </ol>
          </CardContent>
        </Card>

        <div className="mt-6 grid md:grid-cols-2 gap-4">
          {templates.map((t) => (
            <Card key={t.id} className="bg-slate-900/40 border-slate-800">
              <CardHeader className="pb-3">
                <CardTitle className="text-slate-100 text-base">{t.title}</CardTitle>
                <div className="text-slate-400 text-sm">
                  Routine name: <span className="text-slate-200">{t.routineName}</span>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="rounded-xl border border-slate-800 bg-slate-950/50 px-4 py-3 font-mono text-sm text-slate-100">
                  {t.phrase}
                </div>
                <Button variant="secondary" className="w-full" onClick={() => copy(t.phrase, t.id)}>
                  {copiedId === t.id ? (
                    <span className="inline-flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4" /> Copied
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-2">
                      <Copy className="w-4 h-4" /> Copy phrase
                    </span>
                  )}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
