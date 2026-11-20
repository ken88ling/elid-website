"use client";

import type { ReactNode } from "react";
import { AppShell } from "./app-shell";
import { Spinner } from "./ui";
import { SessionProvider } from "@/lib/session";

/** Client-side session gate + app chrome for every signed-in page. */
export function AppFrame({ children }: { children: ReactNode }) {
  return (
    <SessionProvider
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <Spinner />
        </div>
      }
    >
      <AppShell>{children}</AppShell>
    </SessionProvider>
  );
}
