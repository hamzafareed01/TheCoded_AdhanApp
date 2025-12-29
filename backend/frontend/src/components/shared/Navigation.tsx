import { useNavigate, useLocation } from 'react-router-dom';
import { Home, Calendar, Building2, BookOpen, Compass, Settings } from 'lucide-react';
import { Button } from '../ui/button';

export function Navigation() {
  const navigate = useNavigate();
  const location = useLocation();

  const navItems = [
    { path: '/dashboard', icon: Home, label: 'Dashboard' },
    { path: '/calendar', icon: Calendar, label: 'Calendar' },
    { path: '/mosque', icon: Building2, label: 'Mosque' },
    { path: '/dua-quran', icon: BookOpen, label: 'Dua & Qur\'an' },
    { path: '/qiblah', icon: Compass, label: 'Qiblah' },
    { path: '/settings', icon: Settings, label: 'Settings' },
  ];

  return (
    <nav className="flex gap-2 flex-wrap">
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive = location.pathname === item.path;
        
        return (
          <Button
            key={item.path}
            onClick={() => navigate(item.path)}
            variant={isActive ? 'default' : 'outline'}
            size="sm"
            className={
              isActive
                ? 'bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white'
                : 'border-slate-700 text-slate-300 hover:bg-slate-800'
            }
          >
            <Icon className="w-4 h-4 mr-2" />
            {item.label}
          </Button>
        );
      })}
    </nav>
  );
}