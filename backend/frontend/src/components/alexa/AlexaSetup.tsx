mport { useEffect, useState } from "react";
import { Logo } from "../shared/Logo";
import { Navigation } from "../shared/Navigation";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { CheckCircle2, Copy, RefreshCw, AlertTriangle, ExternalLink } from "lucide-react";
import { apiFetch } from "../../lib/api";
//Workflow trigger, delete comment later
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
 
export default function AlexaSetup() {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [templates, setTemplates] = useState<Template[]>(FALLBACK_TEMPLATES);
  const [status, setStatus] = useState<LinkStatus | null>(null);
  const [loading, setLoading] = useState(true);
 
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
    setLoading(true);
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
    } catch {
      // silently fail — page still works with fallbacks
    } finally {
      setLoading(false);
    }
  }
 
  useEffect(() => {
    void load();
  }, []);
 
  const isAmazonConnected = !!status?.lwaLinked;
  const isSkillLinked = status?.accountLinkStatus === "LINKED";
  const invocationName = status?.invocationName || "adhan now";
 
  return (
    <div
      className="min-h-screen bg-slate-950 overscroll-none"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      {/* Sticky header */}
      <div className="sticky top-0 z-20 bg-slate-950/95 backdrop-blur-sm border-b border-slate-800/50">
        <div className="max-w-7xl mx-auto px-4 py-3 md:py-4 md:px-6">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <Logo />
              <div className="text-slate-100 font-semibold text-base md:text-lg">
                Alexa Setup
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                className="inline-flex items-center gap-2 min-h-[44px] touch-manipulation active:opacity-80"
                onClick={() => void load()}
                disabled={loading}
              >
                <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
                <span className="hidden sm:inline">Refresh</span>
              </Button>
              <Navigation />
            </div>
          </div>
        </div>
      </div>
 
      <div
        className="max-w-3xl mx-auto px-4 py-6 md:px-6 md:py-8 space-y-6"
        style={{ paddingBottom: "calc(2rem + env(safe-area-inset-bottom))" }}
      >
        {/* Connection status */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
          <h2 className="text-slate-100 font-semibold text-base mb-4">Connection status</h2>
          <div className="flex flex-wrap gap-3">
            <div className={`flex items-center gap-2 rounded-xl px-4 py-2.5 border text-sm font-medium ${
              isAmazonConnected
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                : "bg-slate-800/60 border-slate-700 text-slate-400"
            }`}>
              {isAmazonConnected ? (
                <CheckCircle2 className="w-4 h-4" />
              ) : (
                <AlertTriangle className="w-4 h-4" />
              )}
              Amazon {isAmazonConnected ? "connected" : "not connected"}
            </div>
 
            <div className={`flex items-center gap-2 rounded-xl px-4 py-2.5 border text-sm font-medium ${
              isSkillLinked
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                : "bg-slate-800/60 border-slate-700 text-slate-400"
            }`}>
              {isSkillLinked ? (
                <CheckCircle2 className="w-4 h-4" />
              ) : (
                <AlertTriangle className="w-4 h-4" />
              )}
              Alexa skill {isSkillLinked ? "linked" : "not linked"}
            </div>
          </div>
 
          {!isAmazonConnected && (
            <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
              Connect your Amazon account in Step 2 of onboarding first.{" "}
              <a href="/onboarding/step2" className="underline text-amber-300">Go to Step 2 →</a>
            </div>
          )}
        </div>
 
        {/* Step 1 */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 overflow-hidden">
          <div className="flex items-center gap-4 px-5 py-4 border-b border-slate-800">
            <div className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold flex-shrink-0 ${
              isAmazonConnected && isSkillLinked
                ? "bg-emerald-500 text-white"
                : "bg-slate-700 text-slate-300"
            }`}>
              {isAmazonConnected && isSkillLinked ? <CheckCircle2 className="w-4 h-4" /> : "1"}
            </div>
            <div>
              <div className="text-slate-100 font-semibold">Connect Amazon &amp; enable the skill</div>
              <div className="text-slate-400 text-sm">Sign in with Amazon and link the AdhanNow Alexa skill</div>
            </div>
          </div>
          <div className="px-5 py-4 text-sm text-slate-300 leading-relaxed">
            If you haven't done this yet, go back to onboarding Step 2. Sign in with Amazon,
            then tap <strong className="text-white">Enable Alexa Skill</strong> and follow the prompts to link your account.
            Come back here once both badges above show green.
          </div>
        </div>
 
        {/* Step 2 */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 overflow-hidden">
          <div className="flex items-center gap-4 px-5 py-4 border-b border-slate-800">
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-slate-700 text-slate-300 text-sm font-bold flex-shrink-0">
              2
            </div>
            <div>
              <div className="text-slate-100 font-semibold">Say the wake phrase on each Echo device</div>
              <div className="text-slate-400 text-sm">This registers your device so AdhanNow can play on it</div>
            </div>
          </div>
          <div className="px-5 py-4 text-sm text-slate-300 leading-relaxed">
            On each Echo device you want Adhan on, say:
            <div className="mt-3 rounded-xl bg-slate-950/70 border border-slate-700 px-4 py-3 font-mono text-slate-100 text-sm select-all">
              {`"Alexa, open ${invocationName}"`}
            </div>
            <p className="mt-3 text-slate-400">
              Do this on every Echo device in your home. AdhanNow will detect and register each one automatically.
              You can then select which devices play the Adhan in <strong className="text-white">Settings → Alexa Devices</strong>.
            </p>
          </div>
        </div>
 
        {/* Step 3 */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 overflow-hidden">
          <div className="flex items-center gap-4 px-5 py-4 border-b border-slate-800">
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-slate-700 text-slate-300 text-sm font-bold flex-shrink-0">
              3
            </div>
            <div>
              <div className="text-slate-100 font-semibold">Create Alexa Routines for automatic Adhan</div>
              <div className="text-slate-400 text-sm">One routine per prayer — set once, plays daily</div>
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
            <div className="rounded-xl border border-slate-700 bg-slate-950/40 px-4 py-3 text-xs text-slate-400">
              <strong className="text-slate-300">Tip:</strong> Run each routine manually once after saving to confirm it's working correctly.
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
              <div key={t.id} className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
                <div className="text-slate-100 font-medium text-sm mb-1">{t.title}</div>
                <div className="text-slate-500 text-xs mb-3">
                  Routine name: <span className="text-slate-400">{t.routineName}</span>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-950/50 px-3 py-2.5 font-mono text-sm text-slate-100 select-all mb-3">
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
            Having trouble? Make sure both connection badges above are green before creating routines.
          </p>
          <a
            href="/onboarding/step2"
            className="inline-flex items-center gap-1.5 text-emerald-400 text-sm hover:text-emerald-300 transition-colors flex-shrink-0"
          >
            Step 2 <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>
    </div>
  );
}