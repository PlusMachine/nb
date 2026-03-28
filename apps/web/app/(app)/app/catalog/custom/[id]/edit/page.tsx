import { notFound } from "next/navigation";

import {
  deleteCatalogCustomIngredientAction,
  updateCatalogCustomIngredientAction
} from "@/app/(app)/app/catalog/actions";
import { CustomCatalogIngredientForm } from "@/components/ingredients/custom-catalog-ingredient-form";
import { buildCustomFormInitialValueFromCustomItem } from "@/features/ingredients/custom-catalog-form-values";
import { getUserCatalogIngredientByRef } from "@/features/ingredients/catalog-service";
import { requireUser } from "@/lib/auth";

export default async function EditCustomIngredientPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const item = await getUserCatalogIngredientByRef(user.id, "custom", id);

  if (!item) {
    notFound();
  }

  return (
    <main className="space-y-6">
      <CustomCatalogIngredientForm
        mode="edit"
        initial={buildCustomFormInitialValueFromCustomItem(item)}
        submitLabel="Сохранить изменения"
        onSubmit={(payload) => updateCatalogCustomIngredientAction(id, payload)}
        onDelete={() => deleteCatalogCustomIngredientAction(id)}
      />
    </main>
  );
}
