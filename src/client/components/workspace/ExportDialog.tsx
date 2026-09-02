import { useState } from "react";
import type { SessionDetail } from "../../../shared/schemas";
import {
  buildExport,
  EXPORT_FORMAT_LABELS,
  EXPORT_MIME_TYPES,
  exportFilename,
  type ExportFormat,
} from "../../workspace/export-reflection";
import { MaterialIcon } from "../MaterialIcon";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";

const FORMATS: ExportFormat[] = ["markdown", "json"];

type ExportDialogProps = {
  open: boolean;
  session: SessionDetail | null;
  onClose: () => void;
};

export function ExportDialog({ open, session, onClose }: ExportDialogProps) {
  const [format, setFormat] = useState<ExportFormat>("markdown");
  const [failure, setFailure] = useState<string | null>(null);

  function download() {
    if (!session) return;
    setFailure(null);

    let url: string | null = null;
    try {
      // The file is produced in memory after an explicit action and is never uploaded anywhere.
      const generatedAt = new Date();
      const content = buildExport(session, format, generatedAt);
      const blob = new Blob([content], { type: EXPORT_MIME_TYPES[format] });
      url = URL.createObjectURL(blob);

      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = exportFilename(format, generatedAt);
      anchor.rel = "noopener";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      onClose();
    } catch {
      setFailure("The file could not be prepared. Try again.");
    } finally {
      if (url) URL.revokeObjectURL(url);
    }
  }

  return (
    <Dialog
      open={open}
      title="Export this reflection"
      description="Downloads the active reflection, including its summary when one exists."
      onClose={onClose}
      actions={
        <>
          <Button variant="text" onClick={onClose}>
            Cancel
          </Button>
          <Button icon="download" onClick={download} disabled={!session}>
            Download
          </Button>
        </>
      }
    >
      <fieldset className="border-0 p-0">
        <legend className="text-on-surface mb-3 text-sm font-medium">File format</legend>
        <div className="flex flex-col gap-2">
          {FORMATS.map((option) => (
            <label
              key={option}
              className={`focus-within:outline-focus-ring flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition-colors duration-(--duration-feedback) focus-within:outline-2 ${
                format === option
                  ? "border-primary bg-primary-container/40"
                  : "border-outline-variant hover:bg-surface-container-high"
              }`}
            >
              <input
                type="radio"
                name="export-format"
                value={option}
                checked={format === option}
                onChange={() => setFormat(option)}
                className="accent-primary h-4 w-4"
              />
              <span className="min-w-0">
                <span className="text-on-surface block text-sm font-medium">
                  {EXPORT_FORMAT_LABELS[option]}
                </span>
                <span className="text-on-surface-variant block text-xs">
                  {option === "markdown"
                    ? "Readable text with the conversation, themes, and next steps."
                    : "Structured data with the same conversation and summary fields."}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <p className="bg-warning-container text-on-warning-container mt-4 flex items-start gap-2 rounded-xl p-3 text-xs leading-relaxed">
        <span aria-hidden="true" className="mt-0.5 shrink-0">
          <MaterialIcon name="warning" size={16} />
        </span>
        <span>
          The downloaded file contains private journal content. Once it leaves Cognaxis it is no
          longer protected by your account.
        </span>
      </p>

      {failure && (
        <p role="alert" className="text-error mt-3 text-sm">
          {failure}
        </p>
      )}
    </Dialog>
  );
}
