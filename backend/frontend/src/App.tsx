import { useEffect, useState } from "react";
import RootShell from "./RootShell";
import type { AppUser } from "./types/AppUser";
import { apiFetch } from "./lib/api";

const LS_AMAZON_ACCESS = "amazon_access_token";

export default function App() {
  const [user, setUser] = useState<AppUser | null>(null);

  useEffect(() => {
    async function loadUser() {
      const token = localStorage.getItem(LS_AMAZON_ACCESS);
      if (!token) return; // no fake user

      try {
        const res = await apiFetch("/api/integrations");
        if (!res.ok) return;

        const data = await res.json();
        setUser({
          userId: data.userKey,
          name: data?.alexa?.displayName ?? null,
          // no email here because /api/integrations doesn't provide it
        });
      } catch {
        // keep user null if backend isn't reachable
      }
    }

    loadUser();
  }, []);

  const onLogout = () => {
    localStorage.removeItem(LS_AMAZON_ACCESS);
    setUser(null);
    window.location.href = "/onboarding/step2";
  };

  return <RootShell user={user} onLogout={onLogout} />;
}