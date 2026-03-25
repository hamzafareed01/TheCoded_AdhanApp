import { useEffect, useMemo, useState } from "react";
import { Logo } from "../shared/Logo";
import { Navigation } from "../shared/Navigation";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";
import { Check, Copy, Link2 } from "lucide-react";
import { apiFetch } from "../../lib/api";

type Template = {
  id: string;
  title: string;
  routineName: string;
  phrase: string;
};

type LinkStatus = {
  configured?: boolean;
  linked?: boolean;
  expiresAt?: string | null;
  lastUsedAt?: string | null;
  invocationName?: string | null;
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

export default function AlexaSetup() {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [templates, setTemplates] = useState<Template[]>(FALLBACK_TEMPLATES);
  const [status, setStatus] = useState<LinkStatus | null>(null);

  useEffect(() => {
    async function load() {
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
          const payload = (await statusRes.json()) as LinkStatus;
          setStatus(payload);
        }
      } catch {
        // keep fallback UI
      }
    }

    void load();
  }, []);

  const canCopyLinkingUrl = useMemo(() => {
    return typeof window !== "undefined";
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

  const accountLinkPage = canCopyLinkingUrl
    ? `${window.location.origin}/onboarding/step2`
    : "/onboarding/step2";

  return (
    <div className="min-h-screen bg-slate-950 py-8 px-4">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <Logo />
            <div>
              <div className="text-slate-100 font-semibold text-lg">Alexa Setup</div>
              <div className="text-slate-400 text-sm">
                Skill linking + routine phrases for prayer-based Alexa playback.
              </div>
            </div>
          </div>
          <Navigation />
        </div>

        <div className="grid lg:grid-cols-3 gap-4 mb-6">
          <Card className="bg-slate-900/40 border-slate-800 lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-slate-100">Current status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-slate-300">
              <div className="flex flex-wrap gap-2">
                <Badge variant={status?.configured ? "default" : "secondary"}>
                  {status?.configured ? "OAuth configured" : "OAuth not configured"}
                </Badge>
                <Badge variant={status?.linked ? "default" : "secondary"}>
                  {status?.linked ? "Skill linked" : "Skill not linked yet"}
                </Badge>
              </div>
              <div>
                Invocation name: <span className="text-slate-100">{status?.invocationName || "adhan home"}</span>
              </div>
              {status?.expiresAt ? (
                <div>Skill token expires: <span className="text-slate-100">{new Date(status.expiresAt).toLocaleString()}</span></div>
              ) : null}
              {status?.lastUsedAt ? (
                <div>Last Alexa skill use: <span className="text-slate-100">{new Date(status.lastUsedAt).toLocaleString()}</span></div>
              ) : null}
              <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3">
                Adhan Home now supports backend OAuth/account linking and a real skill playback endpoint.
                Alexa routines still need to be created in the Alexa app because Amazon does not provide a
                public API for third-party routine creation.
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/40 border-slate-800">
            <CardHeader>
              <CardTitle className="text-slate-100">Console values</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-slate-300">
              <div>
                App redirect URL:
                <div className="mt-1 rounded-lg border border-slate-800 bg-slate-950/50 p-2 font-mono text-xs text-slate-100 break-all">
                  {accountLinkPage}
                </div>
              </div>
              <Button variant="secondary" className="w-full" onClick={() => copy(accountLinkPage, "link-url")}> 
                {copiedId === "link-url" ? (
                  <span className="inline-flex items-center gap-2"><Check className="w-4 h-4" /> Copied</span>
                ) : (
                  <span className="inline-flex items-center gap-2"><Link2 className="w-4 h-4" /> Copy auth URL</span>
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
              <li>Open the <b>Alexa</b> app and enable the Adhan Home skill.</li>
              <li>Complete account linking when Alexa opens the Adhan Home authorization page.</li>
              <li>Tap <b>More</b> → <b>Routines</b> → <b>+</b>.</li>
              <li>Pick a routine name and the correct prayer time trigger.</li>
              <li>Tap <b>Add action</b> → <b>Custom</b> → paste the phrase from below.</li>
              <li>Under <b>From</b>, choose the Echo device that should play the Adhan.</li>
              <li>Save and test the routine once manually.</li>
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
                      <Check className="w-4 h-4" /> Copied
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
