import { Button } from "@/components/ui/button";

interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  message: string;
  ctaLabel?: string;
  ctaHref?: string;
}

export function EmptyState({ icon, title, message, ctaLabel, ctaHref }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-card border border-line bg-surface px-6 py-14 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-pill bg-surface-2 text-accent">
        {icon}
      </div>
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="max-w-sm text-sm text-muted">{message}</p>
      {ctaLabel && ctaHref && (
        <Button href={ctaHref} variant="secondary" size="sm" className="mt-1">
          {ctaLabel}
        </Button>
      )}
    </div>
  );
}

export function SkeletonCard() {
  return (
    <div className="w-40 shrink-0 animate-pulse sm:w-44">
      <div className="aspect-square w-full rounded-card bg-surface-2" />
      <div className="mt-2 h-3.5 w-3/4 rounded-pill bg-surface-2" />
      <div className="mt-1.5 h-3 w-1/2 rounded-pill bg-surface-2" />
    </div>
  );
}
