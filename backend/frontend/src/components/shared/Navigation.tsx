import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  Calendar,
  Home,
  MapPin,
  BookOpen,
  Compass,
  Settings as SettingsIcon,
  Volume2,
} from 'lucide-react';
import { t, getCurrentLang } from '../lib/i18n';

const linkBase =
  'inline-flex items-center justify-center gap-1.5 rounded-xl border text-sm transition-colors touch-manipulation min-h-[44px]';

const inactive =
  'border-slate-800 bg-slate-900/40 text-slate-200 hover:bg-slate-900/70 active:opacity-70';

const active =
  'border-emerald-500/40 bg-emerald-500/10 text-emerald-200';

const NAV_ITEM_DEFS = [
  { to: '/dashboard',   icon: Home,         key: 'nav.dashboard' as const },
  { to: '/calendar',    icon: Calendar,     key: 'nav.calendar'  as const },
  { to: '/mosque',      icon: MapPin,       key: 'nav.mosque'    as const },
  { to: '/dua-quran',   icon: BookOpen,     key: 'nav.quran'     as const },
  { to: '/qiblah',      icon: Compass,      key: 'nav.qiblah'    as const },
  { to: '/alexa-setup', icon: Volume2,      key: 'nav.alexa'     as const },
  { to: '/settings',    icon: SettingsIcon, key: 'nav.settings'  as const },
] as const;

function Item({
  to,
  icon: Icon,
  label,
}: {
  to: string;
  icon: React.ElementType;
  label: string;
}) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `${linkBase} ${isActive ? active : inactive} px-2 sm:px-3 py-2`
      }
      title={label}
    >
      <Icon className="w-4 h-4 flex-shrink-0" />
      {/* Label: hidden on small screens, visible from sm breakpoint */}
      <span className="hidden sm:inline">{label}</span>
    </NavLink>
  );
}

export function Navigation() {
  return (
    <nav className="flex items-center gap-1.5 flex-wrap" aria-label="Main navigation">
      {NAV_ITEM_DEFS.map(({ to, icon, key }) => (
        <Item key={to} to={to} icon={icon} label={t(getCurrentLang(), key)} />
      ))}
    </nav>
  );
}
