"use client";

import Link from "next/link";
import { forwardRef } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg" | "icon";

const variantClasses: Record<Variant, string> = {
  primary: "bg-accent text-white hover:bg-accent-strong disabled:opacity-50",
  secondary: "bg-surface-2 text-ink hover:bg-line disabled:opacity-50",
  ghost: "text-muted hover:text-ink hover:bg-surface-2 disabled:opacity-50",
  danger: "bg-red-500/90 text-white hover:bg-red-500 disabled:opacity-50",
};

const sizeClasses: Record<Size, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-6 text-base",
  icon: "h-10 w-10 p-0",
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  href?: string;
  ariaLabel?: string;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", loading = false, href, className = "", children, disabled, ariaLabel, ...rest },
  ref,
) {
  const classes = `inline-flex select-none items-center justify-center gap-2 rounded-pill font-medium transition-colors duration-150 ${variantClasses[variant]} ${sizeClasses[size]} ${className}`;
  if (href) {
    return (
      <Link href={href} className={classes} aria-label={ariaLabel}>
        {children}
      </Link>
    );
  }
  return (
    <button
      ref={ref}
      className={classes}
      disabled={disabled || loading}
      aria-label={ariaLabel}
      aria-busy={loading}
      {...rest}
    >
      {loading && (
        <span className="h-4 w-4 animate-spin rounded-pill border-2 border-current border-t-transparent" aria-hidden />
      )}
      {children}
    </button>
  );
});
