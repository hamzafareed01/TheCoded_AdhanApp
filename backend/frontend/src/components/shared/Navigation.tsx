import React from 'react';
import { NavLink } from 'react-router-dom';
import { Calendar, Home, MapPin, BookOpen, Compass, Settings as SettingsIcon, Volume2 } from 'lucide-react';


const linkBase =
  'inline-flex items-center gap-2 px-3 py-2 rounded-xl border text-sm transition-colors';

const inactive =
  'border-slate-800 bg-slate-900/40 text-slate-200 hover:bg-slate-900/70';

const active =
  'border-emerald-500/40 bg-emerald-500/10 text-emerald-200';

function Item({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) => `${linkBase} ${isActive ? active : inactive}`}
    >
      {icon}
      <span>{label}</span>
    </NavLink>
  );
}

export function Navigation() {
  return (
    <nav className="flex items-center gap-2 flex-wrap">
      <Item to="/dashboard" icon={<Home className="w-4 h-4" />} label="Dashboard" />
      <Item to="/calendar" icon={<Calendar className="w-4 h-4" />} label="Calendar" />
      <Item to="/mosque" icon={<MapPin className="w-4 h-4" />} label="Mosque" />
      <Item to="/dua-quran" icon={<BookOpen className="w-4 h-4" />} label="Dua & Quran" />
      <Item to="/qiblah" icon={<Compass className="w-4 h-4" />} label="Qiblah" />
      <Item to="/alexa-setup" icon={<Volume2 className="w-4 h-4" />} label="Alexa Setup" />
      <Item to="/settings" icon={<SettingsIcon className="w-4 h-4" />} label="Settings" />
    </nav>
  );
}
