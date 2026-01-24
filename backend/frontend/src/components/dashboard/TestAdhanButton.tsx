// src/components/dashboard/TestAdhanButton.tsx
import { useState } from 'react';
import { Button } from '../ui/button';
import { Volume2 } from 'lucide-react';
import { apiFetch } from "../../lib/api";

const ADHAN_AUDIO_URL = '/audio/adhan.mp3'; // 👈 matches frontend/public/audio/adhan.mp3

export default function TestAdhanButton() {
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const handleClick = async () => {
    setLoading(true);
    setFeedback(null);

    try {
      const res = await apiFetch("/api/test-adhan", {
        method: 'POST',
      });

      const json = await res.json().catch(() => ({} as any));

      // If your backend later returns { muted: true } when inside quiet hours,
      // we respect that and DON'T play audio on the frontend.
      if ((json as any).muted) {
        setFeedback(
          json.message ||
            'Within your quiet hours, so we muted the sample Adhan.'
        );
        return;
      }

      // Otherwise, play the local demo file
      const audio = new Audio(ADHAN_AUDIO_URL);

      audio
        .play()
        .then(() => {
          setFeedback('Playing a sample Adhan on this device.');
        })
        .catch((err) => {
          console.error('Audio play error:', err);
          setFeedback(
            'Adhan triggered, but the browser could not play audio. ' +
              'Check that /audio/adhan.mp3 exists and your speakers are on.'
          );
        });
    } catch (err) {
      console.error('Test Adhan request failed:', err);
      setFeedback('Could not reach backend to trigger Adhan.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-2">
      <Button
        onClick={handleClick}
        disabled={loading}
        className="bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-2"
      >
        <Volume2 className="w-4 h-4" />
        {loading ? 'Testing…' : 'Test Adhan'}
      </Button>

      {feedback && (
        <p className="text-xs text-slate-400 max-w-xs text-right">{feedback}</p>
      )}
    </div>
  );
}