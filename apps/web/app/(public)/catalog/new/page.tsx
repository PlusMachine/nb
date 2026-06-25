import { notFound } from "next/navigation";

import { createCatalogCustomIngredientAction } from "@/app/(public)/catalog/actions";
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

const parseFermentableSubtype = (value: string | undefined): "malt" | "fermentable" | undefined => (
  value === "malt" || value === "fermentable" ? value : undefined
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
  const subtype = category === "fermentable"
    ? parseFermentableSubtype(typeof params.subtype === "string" ? params.subtype : undefined)
    : undefined;

  let initial: CustomCatalogIngredientFormInitialValue = {
    category,
    subtype,
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
    <main className="mx-auto max-w-5xl space-y-6">
      <CustomCatalogIngredientForm
        mode="create"
        initial={initial}
        submitLabel="Сохранить в пользовательские ингредиенты"
        onSubmit={createCatalogCustomIngredientAction}
      />
    </main>
  );
}
