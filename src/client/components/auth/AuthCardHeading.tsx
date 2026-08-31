import type { ReactNode } from "react";

type AuthCardHeadingProps = {
  title: string;
  description: ReactNode;
};

export function AuthCardHeading({ title, description }: AuthCardHeadingProps) {
  return (
    <div className="mb-5 flex flex-col gap-2">
      <h1 className="font-display text-on-surface text-[1.75rem] leading-tight font-medium tracking-tight">
        {title}
      </h1>
      <p className="text-on-surface-variant text-[0.9375rem] leading-relaxed">{description}</p>
    </div>
  );
}
