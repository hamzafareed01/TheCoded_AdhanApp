import { useCallback, useEffect, useState } from "react";
import RootShell from "./RootShell";
import type { AppUser } from "./types/AppUser";
import {
  apiFetch,
  clearStoredAmazonToken,
  getStoredAmazonToken,
  restoreAmazonTokenFromUrl,
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
        if (res.status === 401) {
          clearStoredAmazonToken();
        }
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
    console.log("App mounted. Current URL:", window.location.href);
    restoreAmazonTokenFromUrl();
    void loadUser();
    return subscribeToAmazonAuthChanges(() => {
      console.log("Amazon auth changed. Refreshing user...");
      restoreAmazonTokenFromUrl();
      void loadUser();
    });
  }, [loadUser]);

  const onLogout = () => {
    clearStoredAmazonToken();
    setUser(null);
    window.location.href = "/onboarding/step2";
  };

  return <RootShell user={user} onLogout={onLogout} />;
}
