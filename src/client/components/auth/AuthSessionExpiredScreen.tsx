import { MaterialIcon } from "../MaterialIcon";
import { AuthCardHeading } from "./AuthCardHeading";

type AuthSessionExpiredScreenProps = {
  onSignIn: () => void;
  onBackToHome: () => void;
};

export function AuthSessionExpiredScreen({
  onSignIn,
  onBackToHome,
}: AuthSessionExpiredScreenProps) {
  return (
    <>
      <div
        className="bg-error-container text-on-error-container mb-6 flex h-14 w-14 items-center justify-center rounded-2xl"
        aria-hidden="true"
      >
        <MaterialIcon name="lock" size={28} />
      </div>

      <AuthCardHeading
        title="Please sign in again"
        description="Your session could not be verified. Sign in again to continue securely."
      />

      <div className="flex flex-col gap-3">
        <button
          type="button"
          onClick={onSignIn}
          className="bg-primary text-on-primary focus-visible:outline-primary flex min-h-13 w-full items-center justify-center rounded-full px-6 text-[0.9375rem] font-medium transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          Sign in
        </button>
        <button
          type="button"
          onClick={onBackToHome}
          className="text-on-surface hover:bg-surface-container-high focus-visible:outline-primary flex min-h-13 w-full items-center justify-center rounded-full px-6 text-[0.9375rem] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          Back to home
        </button>
      </div>
    </>
  );
}
