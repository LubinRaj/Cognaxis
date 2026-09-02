import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";

type DeleteReflectionDialogProps = {
  open: boolean;
  title: string;
  deleting: boolean;
  errorMessage: string | null;
  onCancel: () => void;
  onConfirm: () => void;
};

export function DeleteReflectionDialog({
  open,
  title,
  deleting,
  errorMessage,
  onCancel,
  onConfirm,
}: DeleteReflectionDialogProps) {
  return (
    <Dialog
      open={open}
      tone="destructive"
      title="Delete this reflection?"
      description={
        <>
          <span className="text-on-surface font-medium">{title}</span> and its generated summary
          will be permanently deleted. This cannot be undone.
        </>
      }
      busy={deleting}
      onClose={onCancel}
      actions={
        <>
          {/* Cancel is listed first so the destructive action never receives initial focus. */}
          <Button variant="text" onClick={onCancel} disabled={deleting} data-autofocus="true">
            Cancel
          </Button>
          <Button
            variant="destructive"
            icon="delete"
            onClick={onConfirm}
            loading={deleting}
            loadingLabel="Deleting…"
          >
            Delete reflection
          </Button>
        </>
      }
    >
      {errorMessage && (
        <p role="alert" className="text-error text-sm">
          {errorMessage}
        </p>
      )}
    </Dialog>
  );
}
