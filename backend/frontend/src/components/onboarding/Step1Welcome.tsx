import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Logo } from '../shared/Logo';
import { ProgressIndicator } from '../shared/ProgressIndicator';
import { Button } from '../ui/button';
import { CheckCircle2 } from 'lucide-react';
import { AlexaIcon, GoogleIcon, AppleIcon, SamsungIcon, SonosIcon } from '../shared/BrandIcons';

const platformIconMap: any = {
  alexa: AlexaIcon,
  google: GoogleIcon,
  apple: AppleIcon,
  samsung: SamsungIcon,
  sonos: SonosIcon
};

const platforms = [
  {
    id: 'alexa',
    name: 'Amazon Alexa',
    caption: 'Echo & Fire TV'
  },
  {
    id: 'google',
    name: 'Google Assistant / Nest',
    caption: 'Nest speakers & displays'
  },
  {
    id: 'apple',
    name: 'Apple Siri / HomePod',
    caption: 'HomePod & HomeKit'
  },
  {
    id: 'samsung',
    name: 'Samsung SmartThings / Bixby',
    caption: 'SmartThings ecosystem'
  },
  {
    id: 'sonos',
    name: 'Sonos',
    caption: 'Uses Alexa/Google integration'
  }
];

export default function Step1Welcome({ onboardingData, setOnboardingData }: any) {
  const navigate = useNavigate();
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(onboardingData.selectedPlatforms || []);

  const togglePlatform = (platformId: string) => {
    setSelectedPlatforms(prev => 
      prev.includes(platformId) 
        ? prev.filter(id => id !== platformId)
        : [...prev, platformId]
    );
  };

  const handleContinue = () => {
    setOnboardingData({ ...onboardingData, selectedPlatforms });
    navigate('/onboarding/step2');
  };

  return (
    <div className="min-h-screen bg-slate-950 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <Logo className="mb-8" />
        
        <ProgressIndicator currentStep={1} totalSteps={6} />

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 md:p-12">
          <h1 className="text-white mb-4">Welcome</h1>
          <p className="text-slate-300 mb-8 max-w-2xl">
            We'll help you set up accurate prayer times and automatic Adhan across your smart speakers and devices.
          </p>

          <div className="mb-8">
            <h2 className="text-white mb-6">Choose platforms to connect</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {platforms.map(platform => {
                const IconComponent = platformIconMap[platform.id];
                return (
                  <button
                    key={platform.id}
                    onClick={() => togglePlatform(platform.id)}
                    className={`relative p-6 rounded-xl border-2 transition-all text-left ${
                      selectedPlatforms.includes(platform.id)
                        ? 'border-emerald-500 bg-emerald-500/10'
                        : 'border-slate-700 bg-slate-800/50 hover:border-slate-600'
                    }`}
                  >
                    {selectedPlatforms.includes(platform.id) && (
                      <CheckCircle2 className="absolute top-4 right-4 w-5 h-5 text-emerald-500" />
                    )}
                    <div className="mb-3">
                      <IconComponent className="w-12 h-12" />
                    </div>
                    <div className="text-white mb-1">{platform.name}</div>
                    <div className="text-slate-400 text-sm">{platform.caption}</div>
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
              className="text-emerald-400 hover:text-emerald-300 transition-colors"
            >
              Already set up? Go to dashboard
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
