import { PublicShell } from "@/components/shared/public-shell";
import { getSessionUser, hasRequiredRole } from "@/lib/auth";

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();

  return (
    <PublicShell
      user={
        user
          ? {
              email: user.email,
              phone: user.phone,
              displayName: user.displayName,
              isStaff: hasRequiredRole(user.role, "editor")
            }
          : null
      }
    >
      {children}
    </PublicShell>
  );
}
