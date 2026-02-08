import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Logo } from "../shared/Logo";
import { ProgressIndicator } from "../shared/ProgressIndicator";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { CheckCircle } from "lucide-react";
import { AlexaIcon, GoogleIcon, AppleIcon, SamsungIcon, SonosIcon } from "../shared/BrandIcons";
import { apiFetch } from "../../lib/api";

const platformIconMap: any = {
  alexa: AlexaIcon,
  google: GoogleIcon,
  apple: AppleIcon,
  samsung: SamsungIcon,
  sonos: SonosIcon,
};

const platformDetails: any = {
  alexa: { name: "Amazon Alexa", buttonText: "Login with Amazon" },
  google: { name: "Google Assistant", buttonText: "Connect Google" },
  apple: { name: "Apple Home", buttonText: "Show HomeKit setup code" },
  samsung: { name: "Samsung SmartThings", buttonText: "Connect SmartThings" },
  sonos: {
    name: "Sonos",
    buttonText: "Connected via Alexa/Google",
    helper: "Sonos will use your Alexa or Google connection",
  },
};

function getAmazonClientId(): string {
  return ((import.meta as any).env?.VITE_AMAZON_CLIENT_ID || "").trim();
}

function getReturnUrl(): string {
  const envUrl = ((import.meta as any).env?.VITE_AMAZON_RETURN_URL || "").trim();
  return envUrl || `${window.location.origin}/onboarding/step2`;
}

function randomState(len = 24) {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let out = "";
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function parseHashParams(hash: string) {
  const clean = hash.replace(/^#/, "");
  return new URLSearchParams(clean);
}

export default function Step2ConnectAccounts({ onboardingData, setOnboardingData }: any) {
  const navigate = useNavigate();
  const selectedPlatforms = onboardingData.selectedPlatforms || [];

  const [connectedPlatforms, setConnectedPlatforms] = useState<string[]>([]);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const markConnected = (platformId: string) => {
    setConnectedPlatforms((prev) => (prev.includes(platformId) ? prev : [...prev, platformId]));
  };

  // 1) On page load, handle Amazon redirect callback (access_token is in URL hash)
  useEffect(() => {
    (async () => {
      try {
        if (!window.location.hash?.includes("access_token=") && !window.location.hash?.includes("error=")) {
          return;
        }

        setConnecting("alexa");

        const params = parseHashParams(window.location.hash);
        const accessToken = params.get("access_token");
        const returnedState = params.get("state");
        const errorParam = params.get("error");
        const errorDesc = params.get("error_description");

        // Clean URL immediately (prevents re-trigger on refresh)
        window.history.replaceState({}, document.title, window.location.pathname + window.location.search);

        if (errorParam) {
          setError(errorDesc || `Amazon login error: ${errorParam}`);
          setConnecting(null);
          return;
        }

        const expectedState = sessionStorage.getItem("lwa_state");
        sessionStorage.removeItem("lwa_state");

        if (expectedState && returnedState && expectedState !== returnedState) {
          setError("Amazon login failed (state mismatch). Please try again.");
          setConnecting(null);
          return;
        }

        if (!accessToken) {
          setError("Amazon did not return an access token. Check Return URL settings in Amazon Security Profile.");
          setConnecting(null);
          return;
        }

        // ✅ Send token to backend. Backend can fetch profile server-side (avoids CORS/mobile issues).
        const r = await apiFetch("/api/integrations/alexa/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accessToken }),
        });

        if (!r.ok) {
          const msg = await r.text().catch(() => "");
          throw new Error(`Backend /api/integrations/alexa/login failed: ${r.status} ${msg}`);
        }

        markConnected("alexa");
        setConnecting(null);
      } catch (e: any) {
        console.error(e);
        setError(e?.message || "Amazon login succeeded, but saving failed.");
        setConnecting(null);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connectAmazonRedirect = async () => {
    setError(null);

    const clientId = getAmazonClientId();
    if (!clientId) {
      setError("Missing VITE_AMAZON_CLIENT_ID in frontend env.");
      return;
    }

    setConnecting("alexa");

    const returnUrl = getReturnUrl();
    const state = randomState(24);
    sessionStorage.setItem("lwa_state", state);

    // ✅ Most reliable flow for mobile/PWA: manual redirect to Amazon OAuth
    const authUrl = new URL("https://www.amazon.com/ap/oa");
    authUrl.searchParams.set("client_id", clientId);
    authUrl.searchParams.set("scope", "profile");
    authUrl.searchParams.set("response_type", "token"); // implicit
    authUrl.searchParams.set("redirect_uri", returnUrl);
    authUrl.searchParams.set("state", state);

    window.location.assign(authUrl.toString());
  };

  const handleConnect = async (platformId: string) => {
    setError(null);
    if (platformId === "alexa") {
      await connectAmazonRedirect();
      return;
    }
    markConnected(platformId);
  };

  const handleNext = () => {
    setOnboardingData({ ...onboardingData, connectedPlatforms });
    navigate("/onboarding/step3");
  };

  const isBusy = connecting === "alexa";

  return (
    <div className="min-h-screen bg-slate-950 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <Logo className="mb-8" />
        <ProgressIndicator currentStep={2} totalSteps={6} />

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 md:p-12">
          <h1 className="text-white mb-4">Connect your accounts</h1>
          <p className="text-slate-300 mb-4">
            Connect your smart home accounts so we can discover your devices and schedule Adhan safely.
          </p>

          {error && (
            <div className="mb-4 text-sm text-red-400 bg-red-950/40 border border-red-900 rounded-md px-3 py-2">
              {error}
            </div>
          )}

          <div className="space-y-4 mb-8">
            {selectedPlatforms.map((platformId: string) => {
              const platform = platformDetails[platformId];
              const isConnected = connectedPlatforms.includes(platformId);
              const IconComponent = platformIconMap[platformId];

              return (
                <div key={platformId} className="p-6 bg-slate-800/50 border border-slate-700 rounded-xl">
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-3">
                      <IconComponent className="w-12 h-12" />
                      <div>
                        <div className="text-white mb-1">{platform.name}</div>

                        {isConnected ? (
                          <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
                            <CheckCircle className="w-3 h-3 mr-1" />
                            Connected
                          </Badge>
                        ) : (
                          <div className="text-slate-400 text-sm">
                            {platformId === "alexa" && isBusy ? "Redirecting to Amazon login…" : "Not connected"}
                          </div>
                        )}

                        {platform.helper && <div className="text-slate-500 text-sm mt-1">{platform.helper}</div>}
                      </div>
                    </div>

                    <div>
                      <Button
                        onClick={() => handleConnect(platformId)}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white"
                        size="sm"
                        disabled={(platformId === "alexa" && isBusy) || platformId === "sonos"}
                      >
                        {platformId === "alexa" && isBusy ? "Connecting…" : platform.buttonText}
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex gap-4">
            <Button
              onClick={() => navigate("/onboarding/step1")}
              variant="outline"
              className="flex-1 border-slate-700 text-slate-300 hover:bg-slate-800"
              size="lg"
            >
              Back
            </Button>

            <Button
              onClick={handleNext}
              disabled={connectedPlatforms.length === 0}
              className="flex-1 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white"
              size="lg"
            >
              Next
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

