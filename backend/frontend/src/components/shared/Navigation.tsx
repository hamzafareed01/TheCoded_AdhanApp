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
import { t, getCurrentLang } from '../../lib/i18n';
 
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
      aria-label={label}
      title={label}
      className={({ isActive }) =>
        [
          // Base
          'flex-shrink-0 inline-flex items-center justify-center gap-1.5 rounded-xl',
          'transition-colors duration-150 select-none touch-manipulation',
          'outline-none focus-visible:ring-2 focus-visible:ring-emerald-500',
          // Sizing: square 44px tap target on mobile, wide w/ label on desktop
          'h-11 w-11 md:h-9 md:w-auto md:px-3',
          // Colors
          isActive
            ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-md shadow-emerald-500/25'
            : 'text-slate-400 hover:text-white hover:bg-slate-800/80 active:bg-slate-700/80',
        ].join(' ')
      }
    >
      <Icon className="w-[18px] h-[18px] flex-shrink-0" />
      {/* Label hidden on mobile, visible from md */}
      <span className="hidden md:inline text-sm whitespace-nowrap">{label}</span>
    </NavLink>
  );
}
 
export function Navigation() {
  return (
    <nav
      className="flex items-center gap-1 md:gap-1.5 overflow-x-auto md:overflow-visible flex-1 md:flex-none min-w-0 ml-auto"
      style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
      aria-label="Main navigation"
    >
      {NAV_ITEM_DEFS.map(({ to, icon, key }) => (
        <Item key={to} to={to} icon={icon} label={t(getCurrentLang(), key)} />
      ))}
    </nav>
  );
}
 