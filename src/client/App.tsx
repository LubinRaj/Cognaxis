import { onAuthStateChanged, type User } from "firebase/auth";
import { useEffect, useState } from "react";
import { ConfigurationRequired } from "./components/ConfigurationRequired";
import { JournalWorkspace } from "./components/JournalWorkspace";
import { SignIn } from "./components/SignIn";
import { auth, isFirebaseConfigured } from "./lib/firebase";

export function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(isFirebaseConfigured);

  useEffect(() => {
    if (!auth) return;
    return onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setLoading(false);
    });
  }, []);

  if (!isFirebaseConfigured) return <ConfigurationRequired />;
  if (loading) return <main className="centered-page"><p>Checking your session…</p></main>;
  if (!user) return <SignIn />;
  return <JournalWorkspace user={user} />;
}
