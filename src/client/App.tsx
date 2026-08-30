import { useEffect, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { auth, isFirebaseConfigured } from "./lib/firebase";
import { SignIn } from "./components/SignIn";
import { ConfigurationRequired } from "./components/ConfigurationRequired";
import { JournalWorkspace } from "./components/JournalWorkspace";
import { Loader2 } from "lucide-react";

export function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(!!auth);

  useEffect(() => {
    if (!auth) {
      return;
    }
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  if (!isFirebaseConfigured || !auth) {
    return <ConfigurationRequired />;
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950">
        <Loader2 className="h-8 w-8 animate-spin text-sky-500" />
      </div>
    );
  }

  if (!user) {
    return <SignIn />;
  }

  return <JournalWorkspace user={user} />;
}

export default App;
