// src/App.tsx
import RootShell from "./RootShell";
import type { LoggedInUser } from "./components/auth/LoginView";

export default function App() {
  const demoUser: LoggedInUser = {
    userId: "demo",
    email: "guest@adhanhome.app",
    name: "Guest",
  };

  return <RootShell user={demoUser} onLogout={() => {}} />;
}