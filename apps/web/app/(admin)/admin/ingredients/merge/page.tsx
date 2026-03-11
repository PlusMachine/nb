import { requireRole } from "@/lib/auth";
import { DuplicateMergeForm } from "@/components/ingredients/duplicate-merge-form";

export default async function IngredientMergePage() {
  await requireRole("moderator");
  return <DuplicateMergeForm />;
}
