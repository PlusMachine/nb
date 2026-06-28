import { PublicShell } from "@/components/shared/public-shell";
import { getSessionUser } from "@/lib/auth";

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();

  return (
    <PublicShell user={user ? { email: user.email, displayName: user.displayName } : null}>
      {children}
    </PublicShell>
  );
}
