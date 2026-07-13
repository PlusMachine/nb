import { notFound } from "next/navigation";

import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminIngredientForm } from "@/components/ingredients/admin-ingredient-form";
import { resolveIngredientPrimaryDisplayName } from "@/features/ingredients/presentation";
import { getIngredientById } from "@/features/ingredients/service";
import { requireRole } from "@/lib/auth";

export default async function EditIngredientPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole("admin");
  const { id } = await params;
  const item = await getIngredientById(id);
  if (!item) notFound();

  return (
    <section className="space-y-5">
      <AdminPageHeader
        title={resolveIngredientPrimaryDisplayName(item)}
        backHref="/admin/ingredients"
        backLabel="К каталогу"
      />
      <AdminIngredientForm initial={item} />
    </section>
  );
}
