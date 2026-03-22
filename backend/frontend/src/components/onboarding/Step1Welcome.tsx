import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Logo } from '../shared/Logo';
import { ProgressIndicator } from '../shared/ProgressIndicator';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { CheckCircle2 } from 'lucide-react';
import { AlexaIcon, GoogleIcon } from '../shared/BrandIcons';

const platforms = [
  {
    id: 'alexa',
    name: 'Amazon Alexa',
    caption: 'Echo, Fire TV & Alexa-enabled devices',
    Icon: AlexaIcon,
    available: true,
  },
  {
    id: 'google',
    name: 'Google Assistant',
    caption: 'Nest speakers & displays',
    Icon: GoogleIcon,
    available: false,
    status: 'Coming Soon',
  },
];

export default function Step1Welcome({ onboardingData, setOnboardingData }: any) {
  const navigate = useNavigate();
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(onboardingData.selectedPlatforms || []);

  const togglePlatform = (platformId: string, available: boolean) => {
    if (!available) return;

    setSelectedPlatforms((prev) =>
      prev.includes(platformId) ? prev.filter((id) => id !== platformId) : [...prev, platformId]
    );
  };

  const handleContinue = () => {
    setOnboardingData({ ...onboardingData, selectedPlatforms });
    navigate('/onboarding/step2');
  };

  return (
    <div className="min-h-screen bg-slate-950 py-8 px-4">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between gap-4 mb-8">
          <Logo />
          <ProgressIndicator currentStep={1} totalSteps={6} />
        </div>

        <div className="text-center mb-10">
          <h1 className="text-3xl md:text-4xl font-semibold text-white mb-4">Welcome to AdhanCast</h1>
          <p className="text-lg text-slate-300 max-w-2xl mx-auto">
            We'll help you set up accurate prayer times and automatic Adhan across your smart speakers and devices.
          </p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 md:p-12 shadow-[0_30px_80px_rgba(2,8,23,0.45)]">
          <div className="mb-10">
            <h2 className="text-xl md:text-2xl font-semibold text-white mb-2">Choose platforms to connect</h2>
            <p className="text-slate-400 mb-6">Amazon Alexa is available now. Google Assistant support is on the roadmap.</p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {platforms.map((platform) => {
                const isSelected = selectedPlatforms.includes(platform.id);
                const isAvailable = platform.available;

                return (
                  <button
                    key={platform.id}
                    type="button"
                    onClick={() => togglePlatform(platform.id, platform.available)}
                    disabled={!isAvailable}
                    className={`relative overflow-hidden rounded-2xl border-2 p-7 text-left transition-all duration-300 ${
                      !isAvailable
                        ? 'border-slate-800 bg-slate-900/60 opacity-60 cursor-not-allowed'
                        : isSelected
                        ? 'border-emerald-500 bg-emerald-500/10 shadow-[0_20px_40px_rgba(16,185,129,0.12)]'
                        : 'border-slate-800 bg-slate-900/70 hover:border-emerald-500/40 hover:bg-slate-900 hover:-translate-y-0.5'
                    }`}
                  >
                    {isSelected && isAvailable && (
                      <div className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500 shadow-lg shadow-emerald-500/30">
                        <CheckCircle2 className="h-5 w-5 text-white" />
                      </div>
                    )}

                    {!isAvailable && platform.status && (
                      <div className="absolute right-4 top-4">
                        <Badge className="border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-800">
                          {platform.status}
                        </Badge>
                      </div>
                    )}

                    <div
                      className={`mb-5 flex h-16 w-16 items-center justify-center rounded-2xl ${
                        isSelected && isAvailable
                          ? 'bg-emerald-500/10 ring-1 ring-emerald-500/30'
                          : 'bg-slate-800 ring-1 ring-slate-700'
                      }`}
                    >
                      <platform.Icon className="h-9 w-9" />
                    </div>

                    <div className="text-white text-lg font-semibold mb-2">{platform.name}</div>
                    <div className="text-sm text-slate-400 leading-6">{platform.caption}</div>
                  </button>
                );
              })}
            </div>
          </div>

          <Button
            onClick={handleContinue}
            disabled={selectedPlatforms.length === 0}
            className="w-full bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white"
            size="lg"
          >
            Continue
          </Button>

          <div className="mt-6 text-center">
            <button
              onClick={() => navigate('/dashboard')}
              className="text-emerald-400 hover:text-emerald-300 transition-colors text-sm"
            >
              Already set up? Go to dashboard
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
