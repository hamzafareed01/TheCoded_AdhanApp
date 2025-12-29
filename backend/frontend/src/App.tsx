// src/App.tsx
import { useEffect, useState } from 'react';
import LoginView, { LoggedInUser } from './components/auth/LoginView';
import RootShell from './RootShell';

const LOCAL_USER_KEY = 'adhanUser_v2'; // new key so old data is ignored

export default function App() {
  const [user, setUser] = useState<LoggedInUser | null>(null);

  // Load saved user on first render (if any)
  useEffect(() => {
    const saved = localStorage.getItem(LOCAL_USER_KEY);
    if (!saved) return;

    try {
      const parsed = JSON.parse(saved) as LoggedInUser;
      if (parsed && parsed.userId) {
        setUser(parsed);
      }
    } catch {
      // ignore bad JSON
    }
  }, []);

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem(LOCAL_USER_KEY);
  };

  if (!user) {
    // Not logged in yet → show login screen
    return <LoginView onLogin={setUser} storageKey={LOCAL_USER_KEY} />;
  }

  // Logged in → show the normal app shell
  return <RootShell user={user} onLogout={handleLogout} />;
}
