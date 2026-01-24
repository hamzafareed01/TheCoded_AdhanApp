import { useMemo, useState } from "react";
import { Logo } from "../shared/Logo";
import { Navigation } from "../shared/Navigation";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Check, Copy } from "lucide-react";

type Template = {
  id: string;
  title: string;
  routineName: string;
  phrase: string;
};

export default function AlexaSetup() {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const templates: Template[] = useMemo(
    () => [
      {
        id: "fajr",
        title: "Fajr Adhan",
        routineName: "Adhan Home – Fajr",
        phrase: "open adhan home and play fajr adhan",
      },
      {
        id: "dhuhr",
        title: "Dhuhr Adhan",
        routineName: "Adhan Home – Dhuhr",
        phrase: "open adhan home and play dhuhr adhan",
      },
      {
        id: "asr",
        title: "Asr Adhan",
        routineName: "Adhan Home – Asr",
        phrase: "open adhan home and play asr adhan",
      },
      {
        id: "maghrib",
        title: "Maghrib Adhan",
        routineName: "Adhan Home – Maghrib",
        phrase: "open adhan home and play maghrib adhan",
      },
      {
        id: "isha",
        title: "Isha Adhan",
        routineName: "Adhan Home – Isha",
        phrase: "open adhan home and play isha adhan",
      },
    ],
    []
  );

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

  return (
    <div className="min-h-screen bg-slate-950 py-8 px-4">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <Logo />
            <div>
              <div className="text-slate-100 font-semibold text-lg">Alexa Setup</div>
              <div className="text-slate-400 text-sm">
                Create routines using ready-to-copy phrases.
              </div>
            </div>
          </div>
          <Navigation />
        </div>

        <Card className="bg-slate-900/40 border-slate-800">
          <CardHeader>
            <CardTitle className="text-slate-100">How to create a routine (exact steps)</CardTitle>
          </CardHeader>
          <CardContent className="text-slate-200 space-y-2">
            <ol className="list-decimal ml-5 space-y-2">
              <li>Open the <b>Alexa</b> mobile app.</li>
              <li>Tap <b>More</b> → <b>Routines</b>.</li>
              <li>Tap <b>+</b> (Add routine).</li>
              <li>Set the routine name (use the template’s suggested name).</li>
              <li>
                Tap <b>When this happens</b> → <b>Schedule</b> → pick a time.
              </li>
              <li>
                Tap <b>Add action</b> → <b>Custom</b> → paste the phrase from below.
              </li>
              <li>
                Under <b>From</b>, choose the Echo device that should play the adhan.
              </li>
              <li>Save.</li>
            </ol>

            <div className="text-slate-400 text-sm mt-3">
              Tip: Add a “Volume” action before the custom phrase if you want it louder/quieter.
            </div>
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
                <Button
                  variant="secondary"
                  className="w-full"
                  onClick={() => copy(t.phrase, t.id)}
                >
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

        <Card className="mt-6 bg-slate-900/40 border-slate-800">
          <CardHeader>
            <CardTitle className="text-slate-100">Troubleshooting</CardTitle>
          </CardHeader>
          <CardContent className="text-slate-200 space-y-2">
            <div>• If Alexa can’t find the skill: Alexa app → Skills → Your Skills → Dev Skills → enable <b>Adhan Home</b>.</div>
            <div>• If routines don’t play on the right Echo: open the routine and set <b>From</b> to the correct device.</div>
            <div>• “Mute devices while adhan plays” isn’t fully supported; best workaround is routine volume controls.</div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
