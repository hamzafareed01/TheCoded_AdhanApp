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

type LinkStatus = {
  configured?: boolean;
  appLinkClientConfigured?: boolean;
  linked?: boolean;
  lwaLinked?: boolean;
  invocationName?: string | null;
  enablementStatus?: string | null;
  accountLinkStatus?: string | null;
  smartHomeAuthorized?: boolean;
};

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
      const statusRes = await apiFetch("/api/alexa/account-linking/status");
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
  const isAutomationReady = !!status?.smartHomeAuthorized;
  const launchPhrase = `open ${invocationName}`;

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
                  label="Automatic Adhan (Prayer Doorbell)"
                  value={isAutomationReady ? "Authorized" : "Not authorized yet"}
                  tone={isAutomationReady ? "success" : "warning"}
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

            {/* Device naming note — Amazon doesn't share Alexa-app names with skills */}
            <div className="rounded-2xl border border-slate-700/50 bg-slate-800/30 p-5 flex items-start gap-3">
              <Info className="w-5 h-5 text-cyan-400 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-slate-300 leading-relaxed">
                <span className="text-slate-100 font-medium">About device names:</span>{" "}
                Amazon doesn't share the names you set in the Alexa app with third-party
                skills, so your Echos first appear by type (e.g. "Echo Dot"). You can give
                them your own names under{" "}
                <strong className="text-white">Settings → Alexa Devices</strong>, then choose
                which ones play the Adhan.
              </div>
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

            {/* Step 2 — enable Smart Home skill so the doorbell appears */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/40 overflow-hidden">
              <div className="flex items-center gap-4 px-5 py-4 border-b border-slate-800">
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-slate-700 text-slate-300 text-sm font-bold flex-shrink-0">
                  2
                </div>
                <div>
                  <div className="text-slate-100 font-semibold">
                    Enable the AdhanNow Smart Home skill
                  </div>
                  <div className="text-slate-400 text-sm">
                    This adds the virtual Prayer Doorbell that triggers Adhan
                  </div>
                </div>
              </div>
              <div className="px-5 py-4 text-sm text-slate-300 leading-relaxed space-y-3">
                <ol className="list-decimal ml-4 space-y-2 text-slate-300">
                  <li>Open the <strong className="text-white">Alexa app</strong> → <strong className="text-white">More → Skills &amp; Games</strong></li>
                  <li>Search <strong className="text-white">AdhanNow</strong>, open the <strong className="text-white">Smart Home</strong> skill, and tap <strong className="text-white">Enable / Link Account</strong></li>
                  <li>When prompted, sign in so AdhanNow is authorized to ring the doorbell</li>
                  <li>Tap <strong className="text-white">Discover Devices</strong> — the <strong className="text-white">AdhanNow Prayer Doorbell</strong> will appear</li>
                </ol>
                {!isAutomationReady && (
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-200 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <span>
                      Automatic Adhan shows <strong>Not authorized yet</strong> above until you
                      finish enabling and linking this Smart Home skill. Tap{" "}
                      <strong>Refresh status</strong> afterward.
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Step 3 — one doorbell routine for all prayers */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/40 overflow-hidden">
              <div className="flex items-center gap-4 px-5 py-4 border-b border-slate-800">
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-slate-700 text-slate-300 text-sm font-bold flex-shrink-0">
                  3
                </div>
                <div>
                  <div className="text-slate-100 font-semibold">
                    Create one Prayer Doorbell routine
                  </div>
                  <div className="text-slate-400 text-sm">
                    Set it once — it covers all five prayers, every day
                  </div>
                </div>
              </div>
              <div className="px-5 py-4 text-sm text-slate-300 leading-relaxed space-y-3">
                <ol className="list-decimal ml-4 space-y-2 text-slate-300">
                  <li>In the Alexa app go to <strong className="text-white">More → Routines → +</strong></li>
                  <li>Tap <strong className="text-white">When this happens → Smart Home</strong> and choose <strong className="text-white">AdhanNow Prayer Doorbell</strong></li>
                  <li>Tap <strong className="text-white">Add action → Custom</strong> and paste the phrase below</li>
                  <li>Under <strong className="text-white">Device</strong>, pick the Echo that should play the Adhan</li>
                  <li>Save. AdhanNow rings the doorbell at each prayer time and the skill plays that prayer's Adhan</li>
                </ol>
                <div className="rounded-xl border border-slate-800 bg-slate-950/50 px-3 py-2.5 font-mono text-sm text-slate-100 select-all break-words">
                  {launchPhrase}
                </div>
                <Button
                  variant="secondary"
                  className="w-full min-h-[44px] touch-manipulation active:opacity-80"
                  onClick={() => copy(launchPhrase, "launch")}
                >
                  {copiedId === "launch" ? (
                    <span className="inline-flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" /> Copied
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-2">
                      <Copy className="w-4 h-4" /> Copy phrase
                    </span>
                  )}
                </Button>
                <div className="rounded-xl border border-slate-700 bg-slate-950/40 px-4 py-3 text-xs text-slate-400 flex items-start gap-2">
                  <Info className="w-4 h-4 text-slate-300 flex-shrink-0 mt-0.5" />
                  <span>
                    Want multiple rooms? Add more devices to the same routine, or duplicate
                    it and pick a different Echo. You still only need this one trigger.
                  </span>
                </div>
              </div>
            </div>

            {/* Step 4 — silence the doorbell chime */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/40 overflow-hidden">
              <div className="flex items-center gap-4 px-5 py-4 border-b border-slate-800">
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-slate-700 text-slate-300 text-sm font-bold flex-shrink-0">
                  4
                </div>
                <div>
                  <div className="text-slate-100 font-semibold">
                    Silence the doorbell announcement
                  </div>
                  <div className="text-slate-400 text-sm">
                    So you hear only the Adhan, not a chime first
                  </div>
                </div>
              </div>
              <div className="px-5 py-4 text-sm text-slate-300 leading-relaxed space-y-3">
                <ol className="list-decimal ml-4 space-y-2 text-slate-300">
                  <li>In the Alexa app go to <strong className="text-white">Devices → AdhanNow Prayer Doorbell</strong></li>
                  <li>Open its settings and turn off <strong className="text-white">Announcements</strong> / doorbell press notifications</li>
                </ol>
                <div className="rounded-xl border border-slate-700 bg-slate-950/40 px-4 py-3 text-xs text-slate-400 flex items-start gap-2">
                  <Info className="w-4 h-4 text-slate-300 flex-shrink-0 mt-0.5" />
                  <span>
                    <strong className="text-slate-300">Test it:</strong> set any prayer a
                    couple of minutes ahead in AdhanNow, then watch the chosen Echo play the
                    Adhan automatically.
                  </span>
                </div>
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