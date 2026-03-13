"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";

import {
  addCatalogInventoryItemSchema,
  addCustomInventoryItemSchema,
  createUserCustomIngredientSchema,
  updateInventoryItemSchema,
  updateInventoryQuantitySchema
} from "@/features/inventory/contracts";
import {
  addCatalogIngredientToInventory,
  addCustomIngredientToInventory,
  createUserCustomIngredient,
  deleteInventoryItem,
  updateInventoryItem,
  updateInventoryQuantity
} from "@/features/inventory/service";
import { parseMoneyInputToMinor } from "@/features/system/money";
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

const parseOptionalNumber = (value: FormDataEntryValue | null) => {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    return null;
  }

  return normalized;
};

const parseOptionalMoney = (value: FormDataEntryValue | null) => parseMoneyInputToMinor(value);

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
    if (error.message === "INVALID_SOURCE_LINKAGE") {
      return { ok: false, message: "Выберите корректный ингредиент для сохранения." };
    }
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
      return { ok: false, message: "Эта единица измерения не подходит для выбранного ингредиента." };
    }
    if (error.message === "INVALID_PURCHASE_UNIT") {
      return { ok: false, message: "Единица измерения покупки не поддерживается." };
    }
    return { ok: false, message: "Не удалось сохранить ингредиент. Попробуйте еще раз." };
  }

  return { ok: false, message: "Произошла неизвестная ошибка." };
};

export const addCatalogIngredientAction = async (_prevState: AddIngredientResult | null, formData: FormData): Promise<AddIngredientResult> => {
  try {
    const user = await requireUser();
    const purchasePriceMinor = parseOptionalMoney(formData.get("purchasePrice") ?? formData.get("purchasePriceMinor"));
    const purchaseQuantity = parseOptionalNumber(formData.get("purchaseQuantity"));
    const payload = addCatalogInventoryItemSchema.parse({
      ingredientCatalogItemId: String(formData.get("ingredientCatalogItemId") ?? ""),
      enteredQuantity: String(formData.get("enteredQuantity") ?? ""),
      enteredUnit: String(formData.get("enteredUnit") ?? ""),
      purchasePriceMinor,
      purchaseCurrency: purchasePriceMinor == null ? null : String(formData.get("purchaseCurrency") ?? "").trim() || null,
      purchaseQuantity,
      purchaseQuantityUnit: purchaseQuantity == null ? null : String(formData.get("purchaseQuantityUnit") ?? "").trim() || null,
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
    const purchasePriceMinor = parseOptionalMoney(formData.get("purchasePrice") ?? formData.get("purchasePriceMinor"));
    const purchaseQuantity = parseOptionalNumber(formData.get("purchaseQuantity"));

    const customPayload = createUserCustomIngredientSchema.parse({
      type: String(formData.get("type") ?? "") || undefined,
      category: String(formData.get("category") ?? "") || undefined,
      subtype: String(formData.get("subtype") ?? "").trim() || null,
      displayName: String(formData.get("displayName") ?? "").trim(),
      defaultDisplayUnit: String(formData.get("defaultDisplayUnit") ?? "").trim() || null
    });

    const customIngredient = await createUserCustomIngredient(user.id, customPayload);

    const inventoryPayload = addCustomInventoryItemSchema.parse({
      userCustomIngredientId: customIngredient.id,
      enteredQuantity: String(formData.get("enteredQuantity") ?? ""),
      enteredUnit: String(formData.get("enteredUnit") ?? ""),
      purchasePriceMinor,
      purchaseCurrency: purchasePriceMinor == null ? null : String(formData.get("purchaseCurrency") ?? "").trim() || null,
      purchaseQuantity,
      purchaseQuantityUnit: purchaseQuantity == null ? null : String(formData.get("purchaseQuantityUnit") ?? "").trim() || null,
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

export const updateInventoryItemAction = async (payload: {
  inventoryItemId: string;
  ingredientCatalogItemId?: string | null;
  userCustomIngredientId?: string | null;
  enteredQuantity: string;
  enteredUnit: string;
  purchasePrice?: string | null;
  purchasePriceMinor?: string | null;
  purchaseCurrency?: string | null;
  purchaseQuantity?: string | null;
  purchaseQuantityUnit?: string | null;
  purchasedAt?: string | null;
  freshnessDate?: string | null;
  notes?: string | null;
}): Promise<AddIngredientResult> => {
  try {
    const user = await requireUser();
    const purchasePriceMinor = parseOptionalMoney(payload.purchasePrice ?? payload.purchasePriceMinor ?? null);
    const purchaseQuantity = parseOptionalNumber(payload.purchaseQuantity ?? null);
    const parsed = updateInventoryItemSchema.parse({
      ingredientCatalogItemId: payload.ingredientCatalogItemId ?? null,
      userCustomIngredientId: payload.userCustomIngredientId ?? null,
      enteredQuantity: payload.enteredQuantity,
      enteredUnit: payload.enteredUnit,
      purchasePriceMinor,
      purchaseCurrency: purchasePriceMinor == null ? null : payload.purchaseCurrency ?? null,
      purchaseQuantity,
      purchaseQuantityUnit: purchaseQuantity == null ? null : payload.purchaseQuantityUnit ?? null,
      purchasedAt: parseOptionalDate(payload.purchasedAt ?? null),
      freshnessDate: parseOptionalDate(payload.freshnessDate ?? null),
      notes: String(payload.notes ?? "").trim() || null
    });

    await updateInventoryItem(user.id, payload.inventoryItemId, parsed);
    revalidatePath("/app/ingredients");

    return { ok: true, message: "Карточка ингредиента обновлена." };
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") {
      return { ok: false, message: "Позиция не найдена или недоступна." };
    }

    return mapError(error);
  }
};


export const updateInventoryInlineAction = async (payload: {
  inventoryItemId: string;
  enteredQuantity: string;
  enteredUnit: string;
}): Promise<AddIngredientResult> => {
  try {
    const user = await requireUser();
    const parsed = updateInventoryQuantitySchema.parse({
      enteredQuantity: payload.enteredQuantity,
      enteredUnit: payload.enteredUnit
    });

    await updateInventoryQuantity(user.id, payload.inventoryItemId, parsed);
    revalidatePath("/app/ingredients");

    return { ok: true, message: "Остаток обновлен." };
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") {
      return { ok: false, message: "Позиция не найдена или недоступна." };
    }

    return mapError(error);
  }
};

export const deleteInventoryItemAction = async (inventoryItemId: string): Promise<AddIngredientResult> => {
  try {
    const user = await requireUser();
    await deleteInventoryItem(user.id, inventoryItemId);
    revalidatePath("/app/ingredients");

    return { ok: true, message: "Ингредиент удален из запасов." };
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") {
      return { ok: false, message: "Позиция не найдена или уже недоступна." };
    }

    return { ok: false, message: "Не удалось удалить ингредиент. Попробуйте еще раз." };
  }
};

export type { AddIngredientResult };
