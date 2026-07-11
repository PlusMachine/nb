import { requireRole } from "@/lib/auth";
import { ModerationQueue } from "@/components/ingredients/moderation-queue";
import { listProposedIngredients } from "@/features/ingredients/service";

export default async function IngredientModerationPage() {
  await requireRole("moderator");
  const items = await listProposedIngredients("pending");

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Модерация ингредиентов</h1>
      <ModerationQueue initialItems={items.map((item) => ({
        id: item.id,
        sourceDisplayName: item.sourceDisplayName,
        sourcePayload: item.sourcePayload,
        sourceType: item.sourceType,
        status: item.status
      }))} />
    </section>
  );
}
