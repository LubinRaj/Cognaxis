import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { User } from "firebase/auth";
import type { Capabilities } from "../../shared/schemas";
import { useAuth } from "../auth/AuthProvider";
import { ApiClient, ApiError } from "../lib/api-client";

export type CapabilitiesState =
  | { status: "loading" }
  | { status: "ready"; capabilities: Capabilities }
  | { status: "suspended" }
  | { status: "error"; message: string };

type CapabilitiesContextValue = {
  state: CapabilitiesState;
  retry: () => void;
};

const CapabilitiesContext = createContext<CapabilitiesContextValue | null>(null);

export function CapabilitiesProvider({ user, children }: { user: User; children: ReactNode }) {
  const { reportSessionExpired, reportEmailVerificationRequired } = useAuth();
  const [state, setState] = useState<CapabilitiesState>({ status: "loading" });
  const requestIdRef = useRef(0);

  const api = useMemo(
    () =>
      new ApiClient(() => user, {
        onSessionExpired: reportSessionExpired,
        onEmailVerificationRequired: reportEmailVerificationRequired,
      }),
    [user, reportSessionExpired, reportEmailVerificationRequired],
  );

  const fetchCapabilities = useCallback(
    (requestId: number) => {
      api
        .getCapabilities()
        .then((capabilities) => {
          if (requestIdRef.current !== requestId) return;
          setState({ status: "ready", capabilities });
        })
        .catch((error: unknown) => {
          if (requestIdRef.current !== requestId) return;
          if (error instanceof ApiError && error.code === "ACCOUNT_SUSPENDED") {
            setState({ status: "suspended" });
            return;
          }
          setState({
            status: "error",
            message: "Some parts of Cognaxis could not be loaded.",
          });
        });
    },
    [api],
  );

  // The initial state is already "loading", so the mount effect only starts the request.
  useEffect(() => {
    fetchCapabilities(++requestIdRef.current);
    return () => {
      requestIdRef.current += 1;
    };
  }, [fetchCapabilities]);

  const retry = useCallback(() => {
    const requestId = ++requestIdRef.current;
    setState({ status: "loading" });
    fetchCapabilities(requestId);
  }, [fetchCapabilities]);

  const value = useMemo(() => ({ state, retry }), [state, retry]);

  return <CapabilitiesContext.Provider value={value}>{children}</CapabilitiesContext.Provider>;
}

export function useCapabilities(): CapabilitiesContextValue {
  const context = useContext(CapabilitiesContext);
  if (!context) {
    throw new Error("useCapabilities must be used inside a CapabilitiesProvider");
  }
  return context;
}

export function useFeature(feature: keyof Capabilities["features"]): boolean {
  const { state } = useCapabilities();
  return state.status === "ready" && state.capabilities.features[feature];
}
