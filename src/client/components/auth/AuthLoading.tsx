import { MaterialIcon } from "../MaterialIcon";

type AuthLoadingProps = {
  stalled?: boolean;
  onRetry?: () => void;
  stalledMessage?: string;
  retryLabel?: string;
};

export function AuthLoading({
  stalled = false,
  onRetry,
  stalledMessage = "Preparing your workspace is taking longer than expected.",
  retryLabel = "Try again",
}: AuthLoadingProps) {
  return (
    <div className="bg-surface text-on-surface flex min-h-screen flex-col items-center justify-center gap-6 px-4 font-sans">
      <span className="text-primary" aria-hidden="true">
        <MaterialIcon name="psychiatry" size={48} />
      </span>

      {!stalled && (
        <span className="text-primary animate-spin motion-reduce:animate-none" aria-hidden="true">
          <MaterialIcon name="progress_activity" size={24} />
        </span>
      )}

      <p role="status" aria-live="polite" className="text-on-surface-variant text-center text-sm">
        {stalled ? stalledMessage : "Preparing your private workspace…"}
      </p>

      {stalled && onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="bg-primary text-on-primary focus-visible:outline-primary flex min-h-12 items-center justify-center rounded-full px-6 text-sm font-medium transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          {retryLabel}
        </button>
      )}
    </div>
  );
}
