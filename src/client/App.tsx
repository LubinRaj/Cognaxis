import { useEffect, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { auth, isFirebaseConfigured } from "./lib/firebase";
import { SignIn } from "./components/SignIn";
import { ConfigurationRequired } from "./components/ConfigurationRequired";
import { JournalWorkspace } from "./components/JournalWorkspace";
import { Loader2 } from "lucide-react";
import { getFirebaseAuthErrorMessage } from "./lib/auth-errors";
import { completeGoogleRedirect } from "./lib/google-sign-in";

export function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(!!auth);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    const firebaseAuth = auth;
    if (!firebaseAuth) return;

    let active = true;
    let unsubscribe: (() => void) | undefined;

    void completeGoogleRedirect(firebaseAuth)
      .catch((error: unknown) => {
        if (active) setAuthError(getFirebaseAuthErrorMessage(error));
      })
      .finally(() => {
        if (!active) return;
        unsubscribe = onAuthStateChanged(
          firebaseAuth,
          (currentUser) => {
            setUser(currentUser);
            setLoading(false);
          },
          () => {
            setAuthError("Your session could not be verified. Please sign in again.");
            setLoading(false);
          },
        );
      });

    return () => {
      active = false;
      unsubscribe?.();
    };
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
    return <SignIn authError={authError} onAuthAttempt={() => setAuthError(null)} />;
  }

  return <JournalWorkspace user={user} />;
}

export default App;
