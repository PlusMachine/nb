"use client";

import React from "react";

import type {
  IngredientCategory,
  IngredientSubtype
} from "@/features/ingredients/contracts";
import type { SystemCurrency } from "@/features/system/currency";

import { CustomIngredientForm, type CustomIngredientSubmitPayload } from "./custom-ingredient-form";

type Props = {
  category: IngredientCategory;
  initialSubtype?: IngredientSubtype | null;
  preferredCurrency: SystemCurrency;
  pending: boolean;
  fieldErrors?: Record<string, string>;
  onSubmitCreate: (payload: CustomIngredientSubmitPayload) => Promise<void>;
};

export function CustomIngredientPanel({
  category,
  initialSubtype = null,
  preferredCurrency,
  pending,
  fieldErrors,
  onSubmitCreate
}: Props) {
  return (
    <div data-testid="custom-ingredient-create-panel">
      <CustomIngredientForm
        category={category}
        initialSubtype={initialSubtype}
        preferredCurrency={preferredCurrency}
        pending={pending}
        fieldErrors={fieldErrors}
        onSubmit={onSubmitCreate}
      />
    </div>
  );
}
