import { AppShell } from "@/components/app/app-shell";
import { requireUser } from "@/lib/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  return <AppShell user={{ email: user.email, displayName: user.displayName }}>{children}</AppShell>;
}
