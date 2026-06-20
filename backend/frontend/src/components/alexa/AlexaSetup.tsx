import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Logo } from "../shared/Logo";
import { Navigation } from "../shared/Navigation";
import { Button } from "../ui/button";
import {
  CheckCircle2,
  Copy,
  RefreshCw,
  AlertCircle,
  AlertTriangle,
  ExternalLink,
  Link2,
  Info,
} from "lucide-react";
import {
  apiFetch,
  getStoredAmazonToken,
  subscribeToAmazonAuthChanges,
} from "../../lib/api";

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
  invocationName?: string | null;
  enablementStatus?: string | null;
  accountLinkStatus?: string | null;
};

const FALLBACK_TEMPLATES: Template[] = [
  {
    id: "fajr",
    title: "Fajr Adhan",
    routineName: "Adhan Now – Fajr Adhan",
    phrase: "open adhan now and play fajr adhan",
  },
  {
    id: "dhuhr",
    title: "Dhuhr Adhan",
    routineName: "Adhan Now – Dhuhr Adhan",
    phrase: "open adhan now and play dhuhr adhan",
  },
  {
    id: "asr",
    title: "Asr Adhan",
    routineName: "Adhan Now – Asr Adhan",
    phrase: "open adhan now and play asr adhan",
  },
  {
    id: "maghrib",
    title: "Maghrib Adhan",
    routineName: "Adhan Now – Maghrib Adhan",
    phrase: "open adhan now and play maghrib adhan",
  },
  {
    id: "isha",
    title: "Isha Adhan",
    routineName: "Adhan Now – Isha Adhan",
    phrase: "open adhan now and play isha adhan",
  },
];

type StatusTone = "success" | "warning" | "info";

function StatusRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: StatusTone;
}) {
  return (
    <div className="rounded-xl border border-slate-700/60 bg-slate-800/30 p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="text-slate-300 text-sm mb-1.5 font-medium">{label}</div>
          <div className="text-white font-medium truncate">{value}</div>
        </div>
        <div className="flex-shrink-0">
          {tone === "success" ? (
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              <span className="text-emerald-400 text-sm font-medium hidden md:inline">
                Active
              </span>
            </div>
          ) : tone === "warning" ? (
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-amber-400" />
              <span className="text-amber-400 text-sm font-medium hidden md:inline">
                Pending
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Link2 className="w-5 h-5 text-slate-400" />
              <span className="text-slate-400 text-sm font-medium hidden md:inline">
                Info
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AlexaSetup() {
  const navigate = useNavigate();
  const [hasAmazonToken, setHasAmazonToken] = useState<boolean>(
    !!getStoredAmazonToken()
  );
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [templates, setTemplates] = useState<Template[]>(FALLBACK_TEMPLATES);
  const [status, setStatus] = useState<LinkStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return subscribeToAmazonAuthChanges(() => {
      setHasAmazonToken(!!getStoredAmazonToken());
    });
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
    setTimeout(() => setCopiedId((prev) => (prev === id ? null : prev)), 1500);
  }

  async function load() {
    if (!getStoredAmazonToken()) {
      setStatus(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [templatesRes, statusRes] = await Promise.all([
        apiFetch("/api/alexa/routines/templates"),
        apiFetch("/api/alexa/account-linking/status"),
      ]);

      if (templatesRes.ok) {
        const payload = (await templatesRes.json()) as { templates?: Template[] };
        if (Array.isArray(payload.templates) && payload.templates.length > 0) {
          setTemplates(payload.templates);
        }
      }

      if (statusRes.ok) {
        setStatus((await statusRes.json()) as LinkStatus);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to fetch status");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (hasAmazonToken) {
      void load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasAmazonToken]);

  const isAmazonConnected = hasAmazonToken || !!status?.lwaLinked;
  const isSkillLinked = status?.accountLinkStatus === "LINKED";
  const isEnabled = status?.enablementStatus === "ENABLED";
  const invocationName = status?.invocationName || "adhan now";

  return (
    <div
      className="min-h-screen bg-slate-950 overscroll-none"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      {/* Sticky header */}
      <div className="sticky top-0 z-20 bg-slate-950/90 backdrop-blur-md border-b border-white/5">
        <div className="max-w-7xl mx-auto px-4 py-3 md:px-6">
          <div className="flex items-center justify-between gap-4">
            <Logo />
            <Navigation />
          </div>
        </div>
      </div>

      <div
        className="max-w-3xl mx-auto px-4 py-6 md:px-6 md:py-8 space-y-6"
        style={{ paddingBottom: "calc(2rem + env(safe-area-inset-bottom))" }}
      >
        {/* Hero */}
        <div>
          <h1 className="text-3xl md:text-4xl font-semibold text-white mb-3">
            Alexa Setup
          </h1>
          <p className="text-base text-slate-400 leading-relaxed">
            Connect Amazon, register your Echo devices, and set up automatic Adhan.
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-xl border border-red-500/50 bg-red-500/10 px-5 py-4">
            <p className="text-red-300 text-sm leading-relaxed">{error}</p>
          </div>
        )}

        {/* Not connected — empty state with CTA */}
        {!hasAmazonToken ? (
          <div className="rounded-3xl border border-slate-700/50 bg-slate-800/30 p-8 text-center">
            <AlertCircle className="w-12 h-12 text-slate-400 mx-auto mb-4" />
            <h3 className="text-white font-semibold mb-2">Not Connected</h3>
            <p className="text-slate-400 text-sm leading-relaxed mb-6 max-w-md mx-auto">
              Connect your Amazon account to register Echo devices and set up
              automatic Adhan playback.
            </p>
            <Button
              onClick={() => navigate("/onboarding/step2")}
              className="bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white min-h-[44px] touch-manipulation"
            >
              Go to Account Setup
            </Button>
          </div>
        ) : (
          <>
            {/* Refresh */}
            <div>
              <Button
                onClick={() => void load()}
                disabled={loading}
                className="bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white h-12 px-6 touch-manipulation"
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
                Refresh status
              </Button>
            </div>

            {/* Connection status — meaningful rows */}
            <div className="rounded-3xl border border-slate-800/60 bg-slate-900/40 backdrop-blur-sm p-6 md:p-8">
              <h2 className="text-white font-semibold text-lg mb-5">Connection status</h2>
              <div className="space-y-3">
                <StatusRow
                  label="Amazon account"
                  value={isAmazonConnected ? "Connected" : "Not connected"}
                  tone={isAmazonConnected ? "success" : "warning"}
                />
                <StatusRow
                  label="Alexa skill"
                  value={isSkillLinked ? "Linked" : "Not linked"}
                  tone={isSkillLinked ? "success" : "warning"}
                />
                <StatusRow
                  label="Skill enablement"
                  value={status?.enablementStatus || "Unknown"}
                  tone={isEnabled ? "success" : "warning"}
                />
                <StatusRow
                  label="Invocation name"
                  value={`"${invocationName}"`}
                  tone="info"
                />
              </div>

              {!isAmazonConnected && (
                <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
                  Connect your Amazon account in Step 2 of onboarding first.{" "}
                  <a href="/onboarding/step2" className="underline text-amber-300">
                    Go to Step 2 →
                  </a>
                </div>
              )}
            </div>

            {/* Step 2 — wake phrase */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/40 overflow-hidden">
              <div className="flex items-center gap-4 px-5 py-4 border-b border-slate-800">
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-slate-700 text-slate-300 text-sm font-bold flex-shrink-0">
                  1
                </div>
                <div>
                  <div className="text-slate-100 font-semibold">
                    Say the wake phrase on each Echo device
                  </div>
                  <div className="text-slate-400 text-sm">
                    This registers your device so AdhanNow can play on it
                  </div>
                </div>
              </div>
              <div className="px-5 py-4 text-sm text-slate-300 leading-relaxed">
                On each Echo device you want Adhan on, say:
                <div className="mt-3 rounded-xl bg-slate-950/70 border border-slate-700 px-4 py-3 font-mono text-slate-100 text-sm select-all">
                  {`"Alexa, open ${invocationName}"`}
                </div>
                <p className="mt-3 text-slate-400">
                  Do this on every Echo device in your home. AdhanNow will detect and
                  register each one automatically. You can then select which devices play
                  the Adhan in{" "}
                  <strong className="text-white">Settings → Alexa Devices</strong>.
                </p>
              </div>
            </div>

            {/* Step 3 — routines */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/40 overflow-hidden">
              <div className="flex items-center gap-4 px-5 py-4 border-b border-slate-800">
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-slate-700 text-slate-300 text-sm font-bold flex-shrink-0">
                  2
                </div>
                <div>
                  <div className="text-slate-100 font-semibold">
                    Create Alexa Routines for automatic Adhan
                  </div>
                  <div className="text-slate-400 text-sm">
                    One routine per prayer — set once, plays daily
                  </div>
                </div>
              </div>
              <div className="px-5 py-4 text-sm text-slate-300 leading-relaxed space-y-3">
                <ol className="list-decimal ml-4 space-y-2 text-slate-300">
                  <li>Open the <strong className="text-white">Alexa app</strong> on your phone</li>
                  <li>Go to <strong className="text-white">More → Routines → +</strong></li>
                  <li>Set the trigger: choose <strong className="text-white">Schedule → At time</strong> and enter the prayer time</li>
                  <li>Add action: tap <strong className="text-white">Add action → Alexa Says → Customized</strong></li>
                  <li>Paste one of the phrases below</li>
                  <li>Under <strong className="text-white">From</strong>, select your Echo device</li>
                  <li>Save — repeat for each prayer</li>
                </ol>
                <div className="rounded-xl border border-slate-700 bg-slate-950/40 px-4 py-3 text-xs text-slate-400 flex items-start gap-2">
                  <Info className="w-4 h-4 text-slate-300 flex-shrink-0 mt-0.5" />
                  <span>
                    <strong className="text-slate-300">Tip:</strong> Run each routine
                    manually once after saving to confirm it's working correctly.
                  </span>
                </div>
              </div>
            </div>

            {/* Routine phrase templates */}
            <div>
              <h2 className="text-slate-100 font-semibold text-base mb-3">Routine phrases</h2>
              <p className="text-slate-400 text-sm mb-4">
                Copy the phrase for each prayer and paste it into the Alexa Routine action.
              </p>
              <div className="grid sm:grid-cols-2 gap-3">
                {templates.map((t) => (
                  <div
                    key={t.id}
                    className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4"
                  >
                    <div className="text-slate-100 font-medium text-sm mb-1">{t.title}</div>
                    <div className="text-slate-500 text-xs mb-3">
                      Routine name: <span className="text-slate-400">{t.routineName}</span>
                    </div>
                    <div className="rounded-xl border border-slate-800 bg-slate-950/50 px-3 py-2.5 font-mono text-sm text-slate-100 select-all mb-3 break-words">
                      {t.phrase}
                    </div>
                    <Button
                      variant="secondary"
                      className="w-full min-h-[44px] touch-manipulation active:opacity-80"
                      onClick={() => copy(t.phrase, t.id)}
                    >
                      {copiedId === t.id ? (
                        <span className="inline-flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" /> Copied
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-2">
                          <Copy className="w-4 h-4" /> Copy phrase
                        </span>
                      )}
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            {/* Help link */}
            <div className="rounded-2xl border border-slate-800/40 bg-slate-900/20 px-5 py-4 flex items-center justify-between gap-4">
              <p className="text-slate-400 text-sm">
                Having trouble? Make sure the status badges above are green before creating routines.
              </p>
              <a
                href="/onboarding/step2"
                className="inline-flex items-center gap-1.5 text-emerald-400 text-sm hover:text-emerald-300 transition-colors flex-shrink-0"
              >
                Step 2 <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
