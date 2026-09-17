import type { ReactNode } from "react";

/** Shared shell for the placeholder legal pages (Terms / Privacy / Copyright). */
export function LegalPageShell({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-3xl font-extrabold tracking-tight">{title}</h1>
      <p className="mt-2 rounded-card border border-yellow-500/30 bg-yellow-500/10 px-4 py-2.5 text-xs text-yellow-200/90">
        {updated}
      </p>
      <div className="mt-8 flex flex-col gap-4 text-sm leading-relaxed text-muted [&_h2]:mt-6 [&_h2]:text-base [&_h2]:font-bold [&_h2]:text-ink">
        {children}
      </div>
    </div>
  );
}
