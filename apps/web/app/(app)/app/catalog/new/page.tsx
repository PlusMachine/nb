import { notFound } from "next/navigation";

import { createCatalogCustomIngredientAction } from "@/app/(app)/app/catalog/actions";
import {
  CustomCatalogIngredientForm,
  type CustomCatalogIngredientFormInitialValue
} from "@/components/ingredients/custom-catalog-ingredient-form";
import { buildCustomFormInitialValueFromCatalogItem } from "@/features/ingredients/custom-catalog-form-values";
import { getUserCatalogIngredientByRef } from "@/features/ingredients/catalog-service";
import { ingredientCategories, type IngredientCategory } from "@/features/ingredients/contracts";
import { requireUser } from "@/lib/auth";

const parseCategory = (value: string | undefined): IngredientCategory => (
  ingredientCategories.includes(value as IngredientCategory)
    ? value as IngredientCategory
    : "hop"
);

export default async function NewCustomIngredientPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const params = searchParams ? await searchParams : {};
  const derivedFrom = typeof params.derivedFrom === "string" ? params.derivedFrom : undefined;
  const category = parseCategory(typeof params.category === "string" ? params.category : undefined);

  let initial: CustomCatalogIngredientFormInitialValue = {
    category,
    displayName: "",
    aliases: []
  };

  if (derivedFrom) {
    const baseItem = await getUserCatalogIngredientByRef(user.id, "catalog", derivedFrom);
    if (!baseItem) {
      notFound();
    }

    initial = buildCustomFormInitialValueFromCatalogItem(baseItem);
  }

  return (
    <main className="space-y-6">
      <CustomCatalogIngredientForm
        mode="create"
        initial={initial}
        submitLabel="Сохранить в пользовательские ингредиенты"
        onSubmit={createCatalogCustomIngredientAction}
      />
    </main>
  );
}
