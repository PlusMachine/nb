import { requireRole } from "@/lib/auth";
import { DuplicateMergeForm } from "@/components/ingredients/duplicate-merge-form";
import { resolveIngredientPrimaryDisplayName } from "@/features/ingredients/presentation";
import { getIngredientById } from "@/features/ingredients/service";

type Props = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function IngredientMergePage({ searchParams }: Props) {
  await requireRole("moderator");
  const params = searchParams ? await searchParams : {};
  const sourceId = typeof params.sourceId === "string" ? params.sourceId : undefined;
  const targetId = typeof params.targetId === "string" ? params.targetId : undefined;

  const [sourceIngredient, targetIngredient] = await Promise.all([
    sourceId ? getIngredientById(sourceId) : Promise.resolve(null),
    targetId ? getIngredientById(targetId) : Promise.resolve(null)
  ]);

  return (
    <DuplicateMergeForm
      initialSource={sourceIngredient ? {
        id: sourceIngredient.id,
        label: resolveIngredientPrimaryDisplayName(sourceIngredient)
      } : null}
      initialTarget={targetIngredient ? {
        id: targetIngredient.id,
        label: resolveIngredientPrimaryDisplayName(targetIngredient)
      } : null}
    />
  );
}
