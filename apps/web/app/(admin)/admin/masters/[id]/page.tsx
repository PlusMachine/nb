import { notFound } from "next/navigation";

import { MasterModerationPanel } from "@/components/masters/admin/master-moderation-panel";
import { MasterPageView } from "@/components/masters/public/master-page-view";
import { getMasterProfileForModeration } from "@/features/masters/service";
import { requireRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AdminMasterModerationPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireRole("moderator");
  const { id } = await params;

  let data: Awaited<ReturnType<typeof getMasterProfileForModeration>>;
  try {
    data = await getMasterProfileForModeration({ id: user.id, role: user.role }, id);
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") {
      notFound();
    }
    throw error;
  }

  const { profile, previewSnapshot } = data;

  return (
    <section className="space-y-6">
      <MasterModerationPanel profile={profile} />

      <div className="space-y-2">
        <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
          Превью черновика
        </span>
        <div className="rounded-2xl border-2 border-dashed border-border p-1">
          <MasterPageView snapshot={previewSnapshot} />
        </div>
      </div>
    </section>
  );
}
