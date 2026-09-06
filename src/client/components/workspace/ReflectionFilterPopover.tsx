import { useEffect, useRef, useState } from "react";
import { Chip } from "../ui/Chip";
import { IconButton } from "../ui/IconButton";

type ReflectionFilterPopoverProps = {
  availableTags: string[];
  selectedTags: string[];
  onSelectedTagsChange: (tags: string[]) => void;
  label?: string;
};

export function ReflectionFilterPopover({
  availableTags,
  selectedTags,
  onSelectedTagsChange,
  label = "Reflection filters",
}: ReflectionFilterPopoverProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function closeOnOutsideClick(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  function toggleTag(tag: string) {
    onSelectedTagsChange(
      selectedTags.includes(tag)
        ? selectedTags.filter((selected) => selected !== tag)
        : [...selectedTags, tag],
    );
  }

  return (
    <div className="relative shrink-0" ref={containerRef}>
      <IconButton
        icon="filter_list"
        label={label}
        active={open || selectedTags.length > 0}
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="relative"
      />
      {selectedTags.length > 0 && (
        <span className="bg-primary text-on-primary pointer-events-none absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-bold">
          {selectedTags.length}
        </span>
      )}

      {open && (
        <div
          role="dialog"
          aria-label={label}
          className="border-outline-variant bg-surface-container absolute right-0 top-full z-50 mt-2 w-64 rounded-2xl border p-3 shadow-lg"
        >
          <h2 className="text-on-surface text-sm font-medium">Tags</h2>
          {availableTags.length === 0 ? (
            <p className="text-on-surface-variant mt-2 text-xs">No saved tags yet.</p>
          ) : (
            <div className="mt-2 flex max-h-40 flex-wrap gap-2 overflow-y-auto">
              {availableTags.map((tag) => (
                <Chip
                  key={tag}
                  icon={selectedTags.includes(tag) ? "check" : "label"}
                  selected={selectedTags.includes(tag)}
                  onClick={() => toggleTag(tag)}
                >
                  {tag}
                </Chip>
              ))}
            </div>
          )}
          {selectedTags.length > 0 && (
            <button
              type="button"
              className="text-primary hover:text-on-surface focus-visible:outline-focus-ring mt-3 text-xs font-medium focus-visible:outline-2"
              onClick={() => onSelectedTagsChange([])}
            >
              Clear filters
            </button>
          )}
        </div>
      )}
    </div>
  );
}
