import { Moon } from 'lucide-react';

export function Logo({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="w-8 h-8 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-lg flex items-center justify-center">
        <Moon className="w-5 h-5 text-white" />
      </div>
      <span className="text-white">My Adhan Home <span className="text-slate-400">by TheCoded Inc</span></span>
    </div>
  );
}
