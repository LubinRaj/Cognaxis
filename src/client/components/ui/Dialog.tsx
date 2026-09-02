import { useCallback, useId, useRef, type ReactNode } from "react";
import { IconButton } from "./IconButton";
import { useFocusTrap, useScrollLock } from "./use-focus-trap";

export type DialogProps = {
  open: boolean;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  /** Actions are rendered in reading order; place the confirming action last. */
  actions: ReactNode;
  onClose: () => void;
  /** While true the dialog cannot be dismissed, so irreversible work is never interrupted. */
  busy?: boolean;
  tone?: "default" | "destructive";
  size?: "standard" | "wide";
};

export function Dialog({
  open,
  title,
  description,
  children,
  actions,
  onClose,
  busy = false,
  tone = "default",
  size = "standard",
}: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  const requestClose = useCallback(() => {
    if (busy) return;
    onClose();
  }, [busy, onClose]);

  useFocusTrap(panelRef, open, requestClose);
  useScrollLock(open);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div
        className="bg-scrim absolute inset-0"
        onClick={requestClose}
        aria-hidden="true"
        data-testid="dialog-scrim"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={`bg-surface-container-low text-on-surface relative z-10 flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl shadow-xl outline-none sm:rounded-3xl ${
          size === "wide" ? "sm:max-w-lg" : "sm:max-w-md"
        }`}
      >
        <div className="flex items-start justify-between gap-4 p-5 pb-0 sm:p-6 sm:pb-0">
          <div className="min-w-0">
            <h2
              id={titleId}
              className={`font-display text-xl font-medium ${
                tone === "destructive" ? "text-error" : "text-on-surface"
              }`}
            >
              {title}
            </h2>
            {description && (
              <div id={descriptionId} className="text-on-surface-variant mt-2 text-sm leading-relaxed">
                {description}
              </div>
            )}
          </div>
          <IconButton
            icon="close"
            label="Close dialog"
            size={20}
            onClick={requestClose}
            disabled={busy}
            className="-mt-2 -mr-2"
          />
        </div>

        {children && <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-6">{children}</div>}

        <div
          className={`flex flex-col-reverse gap-2 p-5 pt-0 sm:flex-row sm:justify-end sm:p-6 sm:pt-0 ${
            children ? "" : "pt-5 sm:pt-6"
          }`}
        >
          {actions}
        </div>
      </div>
    </div>
  );
}
