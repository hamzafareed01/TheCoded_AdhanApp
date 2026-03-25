import { useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Logo } from "../shared/Logo";

function buildStep2RedirectUrl() {
  const next = new URL(`${window.location.origin}/onboarding/step2`);
  const currentParams = new URLSearchParams(window.location.search || "");

  currentParams.forEach((value, key) => {
    next.searchParams.set(key, value);
  });

  return next.toString();
}

export default function AlexaLinkAuthorize() {
  useEffect(() => {
    const nextUrl = buildStep2RedirectUrl();
    window.location.replace(nextUrl);
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-10">
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="flex items-center gap-3">
          <Logo />
          <div>
            <div className="text-slate-100 text-lg font-semibold">Alexa account linking</div>
            <div className="text-slate-400 text-sm">
              Returning you to AdhanCast to finish Alexa account linking…
            </div>
          </div>
        </div>

        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="text-slate-100">Status</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-slate-300 text-sm">
              Redirecting to Step 2 to complete Alexa linking.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}