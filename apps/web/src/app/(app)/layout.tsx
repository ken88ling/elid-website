import { AppFrame } from "@/components/app-frame";

// Signed-in pages are gated by a client-side session (localStorage in Phase 1),
// so the server only renders a loading shell; navigations into them may block.
export const instant = false;

export default function AppLayout({ children }: LayoutProps<"/">) {
  return <AppFrame>{children}</AppFrame>;
}
