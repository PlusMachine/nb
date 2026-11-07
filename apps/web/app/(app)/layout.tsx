import { AppShell } from "@/components/app/app-shell";
import { OfflineBrewPendingSync } from "@/features/brew-batches/offline/pending-sync";
import { canUseDevices } from "@/features/devices/access";
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
        hasMasterProfile: await hasOwnMasterProfile(user.id),
        hasDevicesAccess: canUseDevices(user.role)
      }}
    >
      <OfflineBrewPendingSync key={user.id} ownerId={user.id} />
      {children}
    </AppShell>
  );
}
