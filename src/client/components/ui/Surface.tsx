import type { ElementType, HTMLAttributes, ReactNode } from "react";

export type SurfaceLevel = "low" | "base" | "high";
export type SurfaceRadius = "control" | "field" | "card" | "dialog" | "none";

const levelClasses: Record<SurfaceLevel, string> = {
  low: "bg-surface-container-low",
  base: "bg-surface-container",
  high: "bg-surface-container-high",
};

const radiusClasses: Record<SurfaceRadius, string> = {
  none: "",
  control: "rounded-lg",
  field: "rounded-xl",
  card: "rounded-2xl",
  dialog: "rounded-3xl",
};

export type SurfaceProps = HTMLAttributes<HTMLElement> & {
  as?: ElementType;
  level?: SurfaceLevel;
  radius?: SurfaceRadius;
  bordered?: boolean;
  children: ReactNode;
};

export function Surface({
  as: Component = "div",
  level = "base",
  radius = "card",
  bordered = false,
  className = "",
  children,
  ...props
}: SurfaceProps) {
  return (
    <Component
      {...props}
      className={`${levelClasses[level]} ${radiusClasses[radius]} ${
        bordered ? "border-outline-variant border" : ""
      } ${className}`}
    >
      {children}
    </Component>
  );
}
