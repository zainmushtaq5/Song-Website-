"use client";

import { useEffect } from "react";

import { ensureAuthConfigured, validateSession } from "@/stores/auth";

export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    ensureAuthConfigured();
    void validateSession();
  }, []);
  return <>{children}</>;
}
