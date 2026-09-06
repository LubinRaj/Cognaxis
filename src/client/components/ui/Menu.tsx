import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { MaterialIcon, type MaterialIconName } from "../MaterialIcon";

export type MenuItemDescriptor = {
  id: string;
  label: string;
  icon?: MaterialIconName;
  onSelect: () => void;
  disabled?: boolean;
  tone?: "default" | "destructive";
  /** Renders a separating rule above this item. */
  separated?: boolean;
  description?: string;
  /** Optional grouped controls rendered directly beneath this menu item. */
  submenu?: ReactNode;
};

export type MenuProps = {
  /** Receives the trigger props; must spread them onto a focusable control. */
  trigger: (props: {
    ref: RefObject<HTMLButtonElement | null>;
    onClick: () => void;
    "aria-haspopup": "menu";
    "aria-expanded": boolean;
    "aria-controls": string;
  }) => ReactNode;
  items: MenuItemDescriptor[];
  label: string;
  align?: "start" | "end";
  placement?: "top" | "bottom";
  header?: ReactNode;
};

export function Menu({
  trigger,
  items,
  label,
  align = "end",
  placement = "bottom",
  header,
}: MenuProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const menuId = useId();

  const enabledIndexes = items
    .map((item, index) => (item.disabled ? -1 : index))
    .filter((index) => index >= 0);

  const close = useCallback((restoreFocus = true) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  // The index is chosen in the click handler, so the effect only has to move focus once the
  // menu items have actually been rendered.
  const pendingFocusIndex = useRef(0);

  useEffect(() => {
    if (!open) return;
    itemRefs.current[pendingFocusIndex.current]?.focus();
  }, [open]);

  function openMenu() {
    if (open) {
      close();
      return;
    }
    const first = enabledIndexes[0] ?? 0;
    pendingFocusIndex.current = first;
    setActiveIndex(first);
    setOpen(true);
  }

  function moveFocus(direction: 1 | -1) {
    if (enabledIndexes.length === 0) return;
    const position = enabledIndexes.indexOf(activeIndex);
    const nextPosition =
      position === -1
        ? 0
        : (position + direction + enabledIndexes.length) % enabledIndexes.length;
    const next = enabledIndexes[nextPosition];
    setActiveIndex(next);
    itemRefs.current[next]?.focus();
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    switch (event.key) {
      case "Escape":
        event.preventDefault();
        close();
        break;
      case "ArrowDown":
        event.preventDefault();
        moveFocus(1);
        break;
      case "ArrowUp":
        event.preventDefault();
        moveFocus(-1);
        break;
      case "Home": {
        event.preventDefault();
        const first = enabledIndexes[0];
        if (first !== undefined) {
          setActiveIndex(first);
          itemRefs.current[first]?.focus();
        }
        break;
      }
      case "End": {
        event.preventDefault();
        const last = enabledIndexes[enabledIndexes.length - 1];
        if (last !== undefined) {
          setActiveIndex(last);
          itemRefs.current[last]?.focus();
        }
        break;
      }
      case "Tab":
        close(false);
        break;
      default:
        break;
    }
  }

  return (
    <div className="relative" ref={containerRef}>
      {trigger({
        ref: triggerRef,
        onClick: openMenu,
        "aria-haspopup": "menu",
        "aria-expanded": open,
        "aria-controls": menuId,
      })}

      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={label}
          onKeyDown={handleKeyDown}
          className={`border-outline-variant bg-surface-container absolute z-50 min-w-56 rounded-2xl border p-2 shadow-lg ${
            align === "end" ? "right-0" : "left-0"
          } ${placement === "top" ? "bottom-full mb-2" : "top-full mt-2"}`}
        >
          {header && (
            <div className="border-outline-variant mb-2 border-b px-3 pt-1 pb-3">{header}</div>
          )}

          {items.map((item, index) => (
            <div key={item.id}>
              {item.separated && <div className="bg-outline-variant my-2 h-px" role="separator" />}
              <button
                ref={(node) => {
                  itemRefs.current[index] = node;
                }}
                type="button"
                role="menuitem"
                disabled={item.disabled}
                tabIndex={index === activeIndex ? 0 : -1}
                onClick={() => {
                  close();
                  item.onSelect();
                }}
                className={`focus-visible:outline-focus-ring flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-medium transition-colors duration-(--duration-feedback) focus-visible:outline-2 focus-visible:-outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
                  item.tone === "destructive"
                    ? "text-error hover:bg-error-container/50"
                    : "text-on-surface hover:bg-surface-container-high"
                }`}
              >
                {item.icon && (
                  <span aria-hidden="true" className="shrink-0">
                    <MaterialIcon name={item.icon} size={20} />
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{item.label}</span>
                  {item.description && (
                    <span className="text-on-surface-variant block text-xs font-normal">
                      {item.description}
                    </span>
                  )}
                </span>
              </button>
              {item.submenu && (
                <div className="border-outline-variant/60 ml-3 mt-1 mb-2 border-l pl-3">
                  {item.submenu}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
