"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";

import {
  addCatalogInventoryItemSchema,
  addCustomInventoryItemSchema,
  createUserCustomIngredientSchema
} from "@/features/inventory/contracts";
import {
  addCatalogIngredientToInventory,
  addCustomIngredientToInventory,
  createUserCustomIngredient
} from "@/features/inventory/service";
import type { IngredientType } from "@/features/ingredients/contracts";
import { requireUser } from "@/lib/auth";

type AddIngredientResult = {
  ok: boolean;
  message: string;
  fieldErrors?: Record<string, string>;
};

const parseOptionalDate = (value: string | null) => {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    return null;
  }
  return normalized;
};

const mapError = (error: unknown): AddIngredientResult => {
  if (error instanceof ZodError) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of error.issues) {
      const key = issue.path[0];
      if (typeof key === "string" && !fieldErrors[key]) {
        fieldErrors[key] = issue.message;
      }
    }

    return {
      ok: false,
      message: "Проверьте корректность заполнения формы.",
      fieldErrors
    };
  }

  if (error instanceof Error) {
    if (error.message === "CATALOG_INGREDIENT_NOT_FOUND") {
      return { ok: false, message: "Ингредиент из каталога не найден или недоступен." };
    }
    if (error.message === "CUSTOM_INGREDIENT_NOT_FOUND") {
      return { ok: false, message: "Собственный ингредиент не найден или недоступен." };
    }
    if (error.message === "INVALID_UNIT") {
      return { ok: false, message: "Единица измерения не поддерживается." };
    }
    if (error.message === "INCOMPATIBLE_UNIT") {
      return { ok: false, message: "Эта единица измерения не подходит для выбранного типа ингредиента." };
    }
    return { ok: false, message: "Не удалось сохранить ингредиент. Попробуйте еще раз." };
  }

  return { ok: false, message: "Произошла неизвестная ошибка." };
};

export const addCatalogIngredientAction = async (_prevState: AddIngredientResult | null, formData: FormData): Promise<AddIngredientResult> => {
  try {
    const user = await requireUser();
    const payload = addCatalogInventoryItemSchema.parse({
      ingredientCatalogItemId: String(formData.get("ingredientCatalogItemId") ?? ""),
      enteredQuantity: String(formData.get("enteredQuantity") ?? ""),
      enteredUnit: String(formData.get("enteredUnit") ?? ""),
      purchasedAt: parseOptionalDate(formData.get("purchasedAt") as string | null),
      freshnessDate: parseOptionalDate(formData.get("freshnessDate") as string | null),
      notes: String(formData.get("notes") ?? "").trim() || null
    });

    await addCatalogIngredientToInventory(user.id, payload);

    revalidatePath("/app/ingredients");
    return { ok: true, message: "Ингредиент добавлен в запасы." };
  } catch (error) {
    return mapError(error);
  }
};

export const addCustomIngredientAction = async (_prevState: AddIngredientResult | null, formData: FormData): Promise<AddIngredientResult> => {
  try {
    const user = await requireUser();
    const type = String(formData.get("type") ?? "") as IngredientType;

    const customPayload = createUserCustomIngredientSchema.parse({
      type,
      displayName: String(formData.get("displayName") ?? "").trim()
    });

    const customIngredient = await createUserCustomIngredient(user.id, customPayload);

    const inventoryPayload = addCustomInventoryItemSchema.parse({
      userCustomIngredientId: customIngredient.id,
      enteredQuantity: String(formData.get("enteredQuantity") ?? ""),
      enteredUnit: String(formData.get("enteredUnit") ?? ""),
      purchasedAt: parseOptionalDate(formData.get("purchasedAt") as string | null),
      freshnessDate: parseOptionalDate(formData.get("freshnessDate") as string | null),
      notes: String(formData.get("notes") ?? "").trim() || null
    });

    await addCustomIngredientToInventory(user.id, inventoryPayload);

    revalidatePath("/app/ingredients");
    return { ok: true, message: "Собственный ингредиент создан и добавлен в запасы." };
  } catch (error) {
    return mapError(error);
  }
};

export type { AddIngredientResult };
