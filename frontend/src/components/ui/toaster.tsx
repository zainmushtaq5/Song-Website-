"use client";

import { CheckCircle2, Info, X, XCircle } from "lucide-react";

import { useToastStore } from "@/stores/toast";

const icons = {
  success: <CheckCircle2 className="h-4 w-4 text-green-400" aria-hidden />,
  error: <XCircle className="h-4 w-4 text-red-400" aria-hidden />,
  info: <Info className="h-4 w-4 text-accent" aria-hidden />,
} as const;

export function Toaster() {
  const { toasts, dismiss } = useToastStore();
  return (
    <div
      className="pointer-events-none fixed right-4 top-4 z-[60] flex w-80 flex-col gap-2"
      role="status"
      aria-live="polite"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className="pointer-events-auto flex items-center gap-2.5 rounded-card border border-line bg-surface-2 px-3.5 py-3 shadow-lg"
        >
          {icons[t.kind]}
          <p className="flex-1 text-sm">{t.message}</p>
          <button
            onClick={() => dismiss(t.id)}
            aria-label="Dismiss notification"
            className="text-muted transition-colors hover:text-ink"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      ))}
    </div>
  );
}
