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
  // Строка-нехватка без каталожной/кастомной привязки (П3): предзаполнение имени
  // и дефицита (UX-находка #20) в форме создания.
  initialDisplayName?: string | null;
  initialQuantity?: string | null;
  initialUnit?: string | null;
  preferredCurrency: SystemCurrency;
  pending: boolean;
  fieldErrors?: Record<string, string>;
  onSubmitCreate: (payload: CustomIngredientSubmitPayload) => Promise<void>;
  /** Не сохранённые данные — для guard'а модалки-обёртки (закрыть без подтверждения?). */
  onDirtyChange?: (dirty: boolean) => void;
};

export function CustomIngredientPanel({
  category,
  initialSubtype = null,
  initialDisplayName = null,
  initialQuantity = null,
  initialUnit = null,
  preferredCurrency,
  pending,
  fieldErrors,
  onSubmitCreate,
  onDirtyChange
}: Props) {
  return (
    <div data-testid="custom-ingredient-create-panel">
      <CustomIngredientForm
        category={category}
        initialSubtype={initialSubtype}
        initialDisplayName={initialDisplayName ?? undefined}
        initialQuantity={initialQuantity}
        initialUnit={initialUnit}
        preferredCurrency={preferredCurrency}
        pending={pending}
        fieldErrors={fieldErrors}
        onSubmit={onSubmitCreate}
        onDirtyChange={onDirtyChange}
      />
    </div>
  );
}
