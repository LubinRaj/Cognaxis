import { AuthActionSurface } from "./AuthActionSurface";
import "@firebase-oss/ui-styles/dist.min.css";
import "../../styles/firebase-ui-theme.css";

export default function AuthActionRoute({
  onReturnToApp,
}: {
  onReturnToApp: (destination?: string | null) => void;
}) {
  return <AuthActionSurface onReturnToApp={onReturnToApp} />;
}
