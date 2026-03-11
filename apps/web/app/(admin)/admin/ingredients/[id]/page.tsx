import { notFound } from "next/navigation";

import { AdminIngredientForm } from "@/components/ingredients/admin-ingredient-form";
import { getIngredientById } from "@/features/ingredients/service";
import { requireRole } from "@/lib/auth";

export default async function EditIngredientPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole("admin");
  const { id } = await params;
  const item = await getIngredientById(id);
  if (!item) notFound();

  return <AdminIngredientForm initial={item} />;
}
