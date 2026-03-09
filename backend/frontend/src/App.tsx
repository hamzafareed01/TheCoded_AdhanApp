import { useCallback, useEffect, useState } from "react";
import RootShell from "./RootShell";
import type { AppUser } from "./types/AppUser";
import {
  apiFetch,
  clearStoredAmazonToken,
  getStoredAmazonToken,
  subscribeToAmazonAuthChanges,
} from "./lib/api";

export default function App() {
  const [user, setUser] = useState<AppUser | null>(null);

  const loadUser = useCallback(async () => {
    const token = getStoredAmazonToken();
    if (!token) {
      setUser(null);
      return;
    }

    try {
      const res = await apiFetch("/api/integrations");
      if (!res.ok) {
        setUser(null);
        return;
      }

      const data = await res.json();
      setUser({
        userId: data.userKey,
        name: data?.alexa?.displayName ?? data?.amazon?.email ?? null,
      });
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    loadUser();
    return subscribeToAmazonAuthChanges(loadUser);
  }, [loadUser]);

  const onLogout = () => {
    clearStoredAmazonToken();
    setUser(null);
    window.location.href = "/onboarding/step2";
  };

  return <RootShell user={user} onLogout={onLogout} />;
}
