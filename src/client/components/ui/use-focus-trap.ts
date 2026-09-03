import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function getFocusableElements(container: HTMLElement): HTMLElement[] {
  // offsetParent is not a reliable visibility test: it is null for fixed-position elements and
  // always null without a layout engine. Explicitly hidden subtrees are excluded instead.
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (element) => element.closest('[hidden], [aria-hidden="true"]') === null,
  );
}

/**
 * Keeps Tab and Shift+Tab inside the container while it is open and restores focus to whatever
 * was focused beforehand. This is the one keyboard trap the accessibility requirements allow,
 * and only for a correctly implemented modal surface.
 */
export function useFocusTrap(
  containerRef: RefObject<HTMLElement | null>,
  active: boolean,
  onEscape?: () => void,
) {
  // The escape handler is read through a ref so a parent re-render (which usually recreates the
  // callback) never re-runs the trap effect. Re-running it would move focus back to the first
  // control while the user is typing.
  const onEscapeRef = useRef(onEscape);
  useEffect(() => {
    onEscapeRef.current = onEscape;
  });

  useEffect(() => {
    if (!active) return;

    const container = containerRef.current;
    const previouslyFocused = document.activeElement as HTMLElement | null;

    const focusables = container ? getFocusableElements(container) : [];
    const initial = focusables.find((element) => element.dataset.autofocus === "true");
    (initial ?? focusables[0] ?? container)?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        onEscapeRef.current?.();
        return;
      }
      if (event.key !== "Tab" || !container) return;

      const items = getFocusableElements(container);
      if (items.length === 0) {
        event.preventDefault();
        return;
      }

      const first = items[0];
      const last = items[items.length - 1];
      const current = document.activeElement;

      if (event.shiftKey && (current === first || !container.contains(current))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && current === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
      previouslyFocused?.focus?.();
    };
  }, [active, containerRef]);
}

/** Prevents the page behind a modal surface from scrolling while it is open. */
export function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [active]);
}
