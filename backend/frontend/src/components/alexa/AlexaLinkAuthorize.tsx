import { useEffect, useMemo, useState } from "react";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Logo } from "../shared/Logo";
import { apiFetch, getStoredAmazonToken, restoreAmazonTokenFromUrl } from "../../lib/api";
import { ensureAmazonSdk, getAmazonClientId } from "../../lib/amazonLogin";

type AuthorizeState = "booting" | "needs-login" | "authorizing" | "done" | "error";

function normalizeCurrentUrlWithoutHash() {
  const current = new URL(window.location.href);
  current.hash = "";
  return current.toString();
}

export default function AlexaLinkAuthorize() {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const [state, setState] = useState<AuthorizeState>("booting");
  const [message, setMessage] = useState("Preparing Alexa account linking…");

  const clientId = params.get("client_id") || "";
  const redirectUri = params.get("redirect_uri") || "";
  const responseType = params.get("response_type") || "code";
  const oauthState = params.get("state") || "";
  const scope = params.get("scope") || "alexa";

  useEffect(() => {
    restoreAmazonTokenFromUrl();
  }, []);

  useEffect(() => {
    async function runAuthorize() {
      if (responseType !== "code") {
        setState("error");
        setMessage("Only OAuth authorization-code linking is supported.");
        return;
      }

      const token = getStoredAmazonToken();
      if (!token) {
        setState("needs-login");
        setMessage("Connect your Amazon account to finish linking this Alexa skill.");
        return;
      }

      try {
        setState("authorizing");
        setMessage("Authorizing your Adhan Home account for Alexa…");

        const res = await apiFetch("/api/alexa/account-linking/authorize", {
          method: "POST",
          body: JSON.stringify({
            clientId,
            redirectUri,
            responseType,
            state: oauthState,
            scope,
          }),
        });

        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(text || `Authorization failed (${res.status}).`);
        }

        const payload = (await res.json()) as { redirectUrl?: string };
        if (!payload.redirectUrl) {
          throw new Error("Missing redirect URL from backend authorization response.");
        }

        setState("done");
        setMessage("Redirecting back to Alexa…");
        window.location.replace(payload.redirectUrl);
      } catch (err) {
        setState("error");
        setMessage(err instanceof Error ? err.message : "Could not authorize Alexa skill.");
      }
    }

    void runAuthorize();
  }, [clientId, oauthState, redirectUri, responseType, scope]);

  async function connectAmazon() {
    try {
      setState("booting");
      setMessage("Opening Amazon Login…");
      await ensureAmazonSdk();

      const clientId = getAmazonClientId();
      const redirectUri = normalizeCurrentUrlWithoutHash();

      window.amazon?.Login?.authorize?.({
        client_id: clientId,
        scope: "profile",
        response_type: "token",
        redirect_uri: redirectUri,
        popup: false,
        state: `alexa_link_${Date.now()}`,
      });
    } catch (err) {
      setState("error");
      setMessage(err instanceof Error ? err.message : "Could not open Amazon Login.");
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-10">
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="flex items-center gap-3">
          <Logo />
          <div>
            <div className="text-slate-100 text-lg font-semibold">Alexa account linking</div>
            <div className="text-slate-400 text-sm">
              This page securely connects your Alexa skill to your Adhan Home account.
            </div>
          </div>
        </div>

        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="text-slate-100">Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-slate-300 text-sm">{message}</p>
            {state === "needs-login" ? (
              <Button onClick={connectAmazon}>Connect Amazon and continue</Button>
            ) : null}
            {state === "error" ? (
              <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">
                If this keeps failing, open the Adhan Home web app first, sign in with Amazon,
                then start Alexa account linking again.
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
