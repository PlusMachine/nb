import { AppShell } from "@/components/app/app-shell";
import { hasOwnMasterProfile } from "@/features/masters/service";
import { hasRequiredRole, requireUser } from "@/lib/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  return (
    <AppShell
      user={{
        email: user.email,
        phone: user.phone,
        displayName: user.displayName,
        isStaff: hasRequiredRole(user.role, "editor"),
        hasMasterProfile: await hasOwnMasterProfile(user.id)
      }}
    >
      {children}
    </AppShell>
  );
}
