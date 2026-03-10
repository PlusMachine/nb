"use client";

import { useEffect } from "react";
import { initAnalytics } from "../lib/analytics";

export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    initAnalytics();
  }, []);

  return <>{children}</>;
}
