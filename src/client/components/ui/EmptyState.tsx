import type { ReactNode } from "react";
import { MaterialIcon, type MaterialIconName } from "../MaterialIcon";

export type EmptyStateProps = {
  icon: MaterialIconName;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  size?: "compact" | "standard";
  headingLevel?: 2 | 3;
};

export function EmptyState({
  icon,
  title,
  description,
  actions,
  children,
  size = "standard",
  headingLevel = 2,
}: EmptyStateProps) {
  const Heading = `h${headingLevel}` as const;

  return (
    <div
      className={`flex flex-col items-center text-center ${
        size === "compact" ? "gap-3 px-4 py-8" : "gap-4 px-6 py-12"
      }`}
    >
      <span
        aria-hidden="true"
        className={`bg-primary-container text-on-primary-container flex items-center justify-center rounded-3xl ${
          size === "compact" ? "h-12 w-12" : "h-16 w-16"
        }`}
      >
        <MaterialIcon name={icon} size={size === "compact" ? 24 : 32} />
      </span>

      <div className="flex flex-col gap-2">
        <Heading
          className={`font-display text-on-surface font-medium ${
            size === "compact" ? "text-base" : "text-xl"
          }`}
        >
          {title}
        </Heading>
        {description && (
          <p className="text-on-surface-variant mx-auto max-w-sm text-sm leading-relaxed">
            {description}
          </p>
        )}
      </div>

      {children}

      {actions && <div className="mt-1 flex flex-wrap justify-center gap-2">{actions}</div>}
    </div>
  );
}
