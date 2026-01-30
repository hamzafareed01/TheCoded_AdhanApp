import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Logo } from '../shared/Logo';
import { ProgressIndicator } from '../shared/ProgressIndicator';
import { Button } from '../ui/button';
import { Checkbox } from '../ui/checkbox';
import { Label } from '../ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Badge } from '../ui/badge';
import { Switch } from '../ui/switch';
import { CheckCircle2 } from 'lucide-react';

const mockDevices: any = {
  alexa: [
    { id: 'alexa-1', name: 'Living Room Echo', type: 'Speaker' },
    { id: 'alexa-2', name: 'Kitchen Echo Show', type: 'Display' },
    { id: 'alexa-3', name: 'Bedroom Echo Dot', type: 'Speaker' }
  ],
  google: [
    { id: 'google-1', name: 'Nest Hub', type: 'Display' },
    { id: 'google-2', name: 'Bedroom Nest Mini', type: 'Speaker' }
  ],
  apple: [
    { id: 'apple-1', name: 'Living Room HomePod', type: 'Speaker' },
    { id: 'apple-2', name: 'HomePod Mini', type: 'Speaker' }
  ],
  samsung: [
    { id: 'samsung-1', name: 'Living Room TV', type: 'Display' }
  ],
  sonos: [
    { id: 'sonos-1', name: 'Sonos One', type: 'Speaker' }
  ]
};

const reciters = [
  { id: 'makkah', name: 'Makkah', image: '🕋' },
  { id: 'madinah', name: 'Madinah', image: '🕌' },
  { id: 'istanbul', name: 'Istanbul', image: '🌙' },
  { id: 'karachi', name: 'Karachi', image: '⭐' }
];

export default function Step5DevicesAdhan({ onboardingData, setOnboardingData }: any) {
  const navigate = useNavigate();
  const [selectedDevices, setSelectedDevices] = useState<string[]>([]);
  const [selectedReciter, setSelectedReciter] = useState('madinah');
  const [quietHoursEnabled, setQuietHoursEnabled] = useState(false);
  const [quietHours, setQuietHours] = useState({ from: '22:00', to: '07:00' });

  const connectedPlatforms = onboardingData.connectedPlatforms || [];
  const platformsWithDevices = connectedPlatforms.filter((p: string) => p !== 'sonos' || connectedPlatforms.includes('alexa') || connectedPlatforms.includes('google'));

  const toggleDevice = (deviceId: string) => {
    setSelectedDevices(prev => 
      prev.includes(deviceId) 
        ? prev.filter(id => id !== deviceId)
        : [...prev, deviceId]
    );
  };

  const handleNext = () => {
    setOnboardingData({ 
      ...onboardingData, 
      devices: selectedDevices,
      adhanPreferences: {
        reciter: selectedReciter,
        quietHoursEnabled,
        quietHours
      }
    });
    navigate('/onboarding/step6');
  };

  return (
    <div className="min-h-screen bg-slate-950 py-8 px-4">
      <div className="max-w-5xl mx-auto">
        <Logo className="mb-8" />
        
        <ProgressIndicator currentStep={5} totalSteps={6} />

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 md:p-12">
          <h1 className="text-white mb-4">Devices & Adhan</h1>
          <p className="text-slate-300 mb-8">
            Choose which devices should play the Adhan and customize your preferences.
          </p>

          {/* Devices Selection */}
          <div className="mb-8">
            <h2 className="text-white mb-4">Choose devices for Adhan</h2>
            
            <Tabs defaultValue={platformsWithDevices[0] || 'alexa'} className="w-full">
              <TabsList className="bg-slate-800 border-slate-700 w-full justify-start overflow-x-auto flex-nowrap">
                {platformsWithDevices.map((platform: string) => (
                  <TabsTrigger 
                    key={platform} 
                    value={platform}
                    className="data-[state=active]:bg-emerald-600 data-[state=active]:text-white"
                  >
                    {platform.charAt(0).toUpperCase() + platform.slice(1)}
                  </TabsTrigger>
                ))}
              </TabsList>
              
              {platformsWithDevices.map((platform: string) => (
                <TabsContent key={platform} value={platform} className="mt-4">
                  <div className="space-y-3">
                    {mockDevices[platform]?.map((device: any) => (
                      <div 
                        key={device.id}
                        className="flex items-center gap-4 p-4 bg-slate-800/50 rounded-lg border border-slate-700"
                      >
                        <Checkbox 
                          id={device.id}
                          checked={selectedDevices.includes(device.id)}
                          onCheckedChange={() => toggleDevice(device.id)}
                        />
                        <Label htmlFor={device.id} className="flex-1 cursor-pointer">
                          <div className="text-white">{device.name}</div>
                          <div className="text-slate-400 text-sm">
                            {platform.charAt(0).toUpperCase() + platform.slice(1)} · {device.type}
                          </div>
                        </Label>
                        <Badge variant="outline" className="border-slate-600 text-slate-400">
                          {device.type}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </TabsContent>
              ))}
            </Tabs>
          </div>

          {/* Reciter Selection */}
          <div className="mb-8">
            <h2 className="text-white mb-4">Adhan Reciter</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {reciters.map(reciter => (
                <button
                  key={reciter.id}
                  onClick={() => setSelectedReciter(reciter.id)}
                  className={`p-6 rounded-xl border-2 transition-all ${
                    selectedReciter === reciter.id
                      ? 'border-emerald-500 bg-emerald-500/10'
                      : 'border-slate-700 bg-slate-800/50 hover:border-slate-600'
                  }`}
                >
                  {selectedReciter === reciter.id && (
                    <CheckCircle2 className="w-5 h-5 text-emerald-500 mb-2" />
                  )}
                  <div className="text-4xl mb-2">{reciter.image}</div>
                  <div className="text-white">{reciter.name}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Quiet Hours */}
          <div className="mb-8 p-6 bg-slate-800/50 rounded-xl border border-slate-700">
            <div className="flex items-center justify-between mb-4">
              <div>
                <Label htmlFor="quiet-hours" className="text-white">Enable quiet hours</Label>
                <p className="text-slate-400 text-sm mt-1">
                  Mute or reduce volume during specific times
                </p>
              </div>
              <Switch 
                id="quiet-hours"
                checked={quietHoursEnabled}
                onCheckedChange={setQuietHoursEnabled}
              />
            </div>

            {quietHoursEnabled && (
              <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-slate-700">
                <div>
                  <Label className="text-white text-sm mb-2 block">From</Label>
                  <input 
                    type="time"
                    value={quietHours.from}
                    onChange={(e) => setQuietHours({ ...quietHours, from: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white"
                  />
                </div>
                <div>
                  <Label className="text-white text-sm mb-2 block">To</Label>
                  <input 
                    type="time"
                    value={quietHours.to}
                    onChange={(e) => setQuietHours({ ...quietHours, to: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white"
                  />
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-4">
            <Button 
              onClick={() => navigate('/onboarding/step4')}
              variant="outline"
              className="flex-1 border-slate-700 text-slate-300 hover:bg-slate-800"
              size="lg"
            >
              Back
            </Button>
            <Button 
              onClick={handleNext}
              disabled={selectedDevices.length === 0}
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
