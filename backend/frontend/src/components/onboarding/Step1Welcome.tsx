import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Logo } from "../shared/Logo";
import { ProgressIndicator } from "../shared/ProgressIndicator";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { CheckCircle2 } from "lucide-react";
import { AlexaIcon, GoogleIcon } from "../shared/BrandIcons";

// Define the shape of the onboarding data
type OnboardingData = {
  selectedPlatforms?: string[];
  [key: string]: unknown;
};

type Step1WelcomeProps = {
  onboardingData: OnboardingData;
  setOnboardingData: (data: OnboardingData) => void;
};

const platforms = [
  {
    id: "alexa",
    name: "Amazon Alexa",
    caption: "Echo, Fire TV & Alexa-enabled devices",
    Icon: AlexaIcon,
    available: true,
  },
  {
    id: "google",
    name: "Google Assistant",
    caption: "Nest speakers & displays",
    Icon: GoogleIcon,
    available: false,
    status: "Coming Soon",
  },
] as const;

export default function Step1Welcome({
  onboardingData,
  setOnboardingData,
}: Step1WelcomeProps) {
  const navigate = useNavigate();
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(
    Array.isArray(onboardingData.selectedPlatforms)
      ? onboardingData.selectedPlatforms
      : []
  );

  useEffect(() => {
    setSelectedPlatforms(
      Array.isArray(onboardingData.selectedPlatforms)
        ? onboardingData.selectedPlatforms
        : []
    );
  }, [onboardingData.selectedPlatforms]);

  const togglePlatform = (platformId: string, available: boolean) => {
    if (!available) return;

    setSelectedPlatforms((prev) =>
      prev.includes(platformId)
        ? prev.filter((id) => id !== platformId)
        : [...prev, platformId]
    );
  };

  const handleContinue = () => {
    setOnboardingData({
      ...onboardingData,
      selectedPlatforms,
    });
    navigate("/onboarding/step2");
  };

  return (
    <div className="min-h-screen bg-slate-950">
      <div className="sticky top-0 z-20 bg-slate-950/95 backdrop-blur-sm border-b border-slate-800/50">
        <div className="max-w-7xl mx-auto px-4 py-4 md:px-6">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <Logo />
            <ProgressIndicator currentStep={1} totalSteps={6} />
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8 md:py-12">
        <div className="text-center mb-8 md:mb-12">
          <h1 className="text-3xl md:text-4xl font-semibold text-white mb-3">
            Welcome to My Adhan Home
          </h1>
          <p className="text-base md:text-lg text-slate-400 max-w-2xl mx-auto leading-relaxed">
            Let&apos;s set up your smart home for accurate prayer times and
            automatic Adhan across your devices.
          </p>
        </div>

        <div className="rounded-3xl border border-slate-800/60 bg-slate-900/40 backdrop-blur-sm p-6 md:p-10">
          <div className="mb-7">
            <h2 className="text-xl font-semibold text-white mb-2">
              Choose your platform
            </h2>
            <p className="text-slate-400 text-sm">
              Select which smart assistant platform you&apos;d like to connect.
              You can add more platforms later.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
            {platforms.map((platform) => {
              const isSelected = selectedPlatforms.includes(platform.id);
              const isAvailable = platform.available;

              return (
                <button
                  key={platform.id}
                  type="button"
                  onClick={() => togglePlatform(platform.id, platform.available)}
                  disabled={!isAvailable}
                  className={`relative overflow-hidden rounded-2xl border-2 p-6 text-left transition-all duration-200 ${
                    !isAvailable
                      ? "border-slate-800/60 bg-slate-900/40 opacity-60 cursor-not-allowed"
                      : isSelected
                      ? "border-emerald-500 bg-emerald-500/10 shadow-lg shadow-emerald-500/10"
                      : "border-slate-800/60 bg-slate-900/60 hover:border-emerald-500/40 hover:bg-slate-900/80"
                  }`}
                >
                  {isSelected && isAvailable && (
                    <div className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500 shadow-lg shadow-emerald-500/30">
                      <CheckCircle2 className="h-5 w-5 text-white" />
                    </div>
                  )}

                  {!isAvailable && platform.status && (
                    <div className="absolute right-4 top-4">
                      <Badge className="border-slate-700/60 bg-slate-800/60 text-slate-300">
                        {platform.status}
                      </Badge>
                    </div>
                  )}

                  <div
                    className={`mb-4 flex h-14 w-14 md:h-16 md:w-16 items-center justify-center rounded-xl ${
                      isSelected && isAvailable
                        ? "bg-emerald-500/10 ring-2 ring-emerald-500/30"
                        : "bg-slate-800/60 ring-1 ring-slate-700/60"
                    }`}
                  >
                    <platform.Icon className="h-8 w-8 md:h-9 md:w-9" />
                  </div>

                  <div className="text-white text-lg font-semibold mb-1">
                    {platform.name}
                  </div>
                  <div className="text-sm text-slate-400">
                    {platform.caption}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="mb-6 p-4 rounded-xl bg-slate-800/30 border border-slate-700/50">
            <p className="text-slate-400 text-sm leading-relaxed">
              <span className="text-emerald-400 font-medium">Amazon Alexa</span>{" "}
              is available now with support for Echo devices and Fire TV.
              <span className="text-slate-500">
                {" "}
                Google Assistant support is coming soon.
              </span>
            </p>
          </div>

          <div className="space-y-4">
            <Button
              onClick={handleContinue}
              disabled={selectedPlatforms.length === 0}
              className="w-full bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white h-11 text-base font-medium"
            >
              Continue to connection
            </Button>

            <div className="text-center">
              <button
                type="button"
                onClick={() => navigate("/dashboard")}
                className="text-emerald-400 hover:text-emerald-300 transition-colors text-sm"
              >
                Already set up? Go to dashboard →
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}