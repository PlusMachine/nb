import { AdminShell } from "@/components/admin/admin-shell";
import { requireContentRole } from "@/features/content/permissions";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireContentRole("editor");

  return <AdminShell role={user.role}>{children}</AdminShell>;
}
