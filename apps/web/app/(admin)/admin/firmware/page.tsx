import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { FirmwareReleasesPanel } from "@/components/admin/firmware/firmware-releases-panel";
import { listAdminFirmwareReleases } from "@/features/firmware/admin";
import { requireRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AdminFirmwarePage() {
  await requireRole("admin");

  const releases = await listAdminFirmwareReleases();

  return (
    <section className="space-y-4">
      <AdminPageHeader title="Прошивки" />
      <FirmwareReleasesPanel releases={releases} />
    </section>
  );
}
