"use server";

import { revalidatePath } from "next/cache";
import { ZodError, type ZodIssue } from "zod";

import {
  addCatalogInventoryItemSchema,
  addCustomInventoryItemSchema,
  createUserCustomInventoryIngredientSchema,
  CUSTOM_INGREDIENT_MAX_COUNT_PER_USER,
  INVENTORY_ITEM_MAX_COUNT_PER_USER,
  updateInventoryItemSchema,
  updateInventoryQuantitySchema,
  type InventoryItemMovementDto
} from "@/features/inventory/contracts";
import {
  addCatalogIngredientToInventory,
  addCustomIngredientToInventory,
  createUserCustomInventoryIngredient,
  deleteInventoryItem,
  listInventoryItemMovements,
  resolveCatalogInventoryAdditionSource,
  setInventoryItemQuantityToZero,
  updateInventoryItem,
  updateInventoryQuantity
} from "@/features/inventory/service";
import { normalizeIngredientPurchaseLinkInputs } from "@/features/ingredients/purchase-links";
import { replaceIngredientPurchaseLinksForReference } from "@/features/ingredients/user-metadata-service";
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

const parseOptionalMoney = (value: FormDataEntryValue | null) => parseMoneyInputToMinor(value);
const parseBooleanFlag = (value: FormDataEntryValue | null) => String(value ?? "").trim() === "true";
const parsePurchaseLinksFromFormData = (formData: FormData) => normalizeIngredientPurchaseLinkInputs(
  formData.getAll("purchaseLinks").map((value) => String(value ?? ""))
);

const translateInventoryZodIssue = (issue: ZodIssue) => {
  const field = typeof issue.path[0] === "string" ? issue.path[0] : "";

  if (issue.message === "Exactly one source is required") {
    return "Выберите ингредиент.";
  }

  if (issue.code === "invalid_enum_value") {
    if (field === "enteredUnit") {
      return "Выберите корректную единицу измерения.";
    }
    if (field === "priceInputCurrency") {
      return "Выберите корректную валюту.";
    }
    return "Выберите корректное значение.";
  }

  if (issue.code === "invalid_type" || issue.message.includes("nan")) {
    return "Введите число.";
  }

  if (issue.code === "too_small" || issue.code === "too_big") {
    return issue.message;
  }

  return issue.message;
};

const mapError = (error: unknown): AddIngredientResult => {
  if (error instanceof ZodError) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of error.issues) {
      const key = issue.path[0];
      if (typeof key === "string" && !fieldErrors[key]) {
        fieldErrors[key] = translateInventoryZodIssue(issue);
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
    if (error.message === "DERIVED_CUSTOM_NAME_CONFLICT") {
      return { ok: false, message: "Не удалось создать пользовательскую версию ингредиента. Попробуйте ещё раз." };
    }
    if (error.message === "INVALID_PURCHASE_LINK_URL") {
      return { ok: false, message: "Проверьте ссылки на покупку: одна из ссылок заполнена некорректно." };
    }
    if (error.message === "RATE_LIMITED") {
      return { ok: false, message: "Слишком много добавлений подряд. Немного подождите и попробуйте снова." };
    }
    if (error.message === "INVENTORY_ITEM_QUOTA_REACHED") {
      return { ok: false, message: `Достигнут предел числа позиций склада (${INVENTORY_ITEM_MAX_COUNT_PER_USER}). Удалите ненужные, чтобы добавлять новые.` };
    }
    if (error.message === "CUSTOM_INGREDIENT_QUOTA_REACHED") {
      return { ok: false, message: `Достигнут предел числа собственных ингредиентов (${CUSTOM_INGREDIENT_MAX_COUNT_PER_USER}). Удалите ненужные, чтобы создавать новые.` };
    }
    return { ok: false, message: "Не удалось сохранить ингредиент. Попробуйте ещё раз." };
  }

  return { ok: false, message: "Произошла неизвестная ошибка." };
};

export const addCatalogIngredientAction = async (_prevState: AddIngredientResult | null, formData: FormData): Promise<AddIngredientResult> => {
  try {
    const user = await requireUser();
    const preferredCurrency = user.preferredCurrency ?? "RUB";
    const purchaseLinksTouched = parseBooleanFlag(formData.get("purchaseLinksTouched"));
    const purchaseLinks = purchaseLinksTouched ? parsePurchaseLinksFromFormData(formData) : [];
    const priceInputAmountMinor = parseOptionalMoney(
      formData.get("priceInputAmount")
      ?? formData.get("purchasePrice")
      ?? formData.get("purchasePriceMinor")
    );
    const payload = addCatalogInventoryItemSchema.parse({
      ingredientCatalogItemId: String(formData.get("ingredientCatalogItemId") ?? ""),
      enteredQuantity: String(formData.get("enteredQuantity") ?? ""),
      enteredUnit: String(formData.get("enteredUnit") ?? ""),
      priceInputMode: String(formData.get("priceInputMode") ?? "").trim() || null,
      priceInputAmountMinor,
      priceInputCurrency: priceInputAmountMinor == null
        ? null
        : String(formData.get("priceInputCurrency") ?? formData.get("purchaseCurrency") ?? "").trim() || preferredCurrency,
      purchasedAt: parseOptionalDate(formData.get("purchasedAt") as string | null),
      freshnessDate: parseOptionalDate(formData.get("freshnessDate") as string | null),
      notes: String(formData.get("notes") ?? "").trim() || null,
      waterTreatmentConcentrationPct: String(formData.get("waterTreatmentConcentrationPct") ?? "").trim() || null
    });

    await addCatalogIngredientToInventory(user.id, payload, { preferredCurrency });
    if (purchaseLinksTouched) {
      await replaceIngredientPurchaseLinksForReference(user.id, {
        source: "catalog",
        id: payload.ingredientCatalogItemId
      }, purchaseLinks);
    }

    revalidatePath("/app/ingredients");
    revalidatePath("/catalog");
    return { ok: true, message: "Ингредиент добавлен в запасы." };
  } catch (error) {
    return mapError(error);
  }
};

export const addSelectedIngredientAction = async (_prevState: AddIngredientResult | null, formData: FormData): Promise<AddIngredientResult> => {
  const ingredientCatalogItemId = String(formData.get("ingredientCatalogItemId") ?? "").trim();
  const userCustomIngredientId = String(formData.get("userCustomIngredientId") ?? "").trim();
  const fermentableColorEbc = String(formData.get("fermentableColorEbc") ?? "").trim() || null;
  const fermentableExtractYieldPct = String(formData.get("fermentableExtractYieldPct") ?? "").trim() || null;
  const hopAlphaAcidPct = String(formData.get("hopAlphaAcidPct") ?? "").trim() || null;
  const hasDerivedCatalogOverrideRequest = Boolean(
    fermentableColorEbc
    || fermentableExtractYieldPct
    || hopAlphaAcidPct
  );

  if (userCustomIngredientId) {
    try {
      const user = await requireUser();
      const preferredCurrency = user.preferredCurrency ?? "RUB";
      const purchaseLinksTouched = parseBooleanFlag(formData.get("purchaseLinksTouched"));
      const purchaseLinks = purchaseLinksTouched ? parsePurchaseLinksFromFormData(formData) : [];
      const priceInputAmountMinor = parseOptionalMoney(
        formData.get("priceInputAmount")
        ?? formData.get("purchasePrice")
        ?? formData.get("purchasePriceMinor")
      );

      const payload = addCustomInventoryItemSchema.parse({
        userCustomIngredientId,
        enteredQuantity: String(formData.get("enteredQuantity") ?? ""),
        enteredUnit: String(formData.get("enteredUnit") ?? ""),
        priceInputMode: String(formData.get("priceInputMode") ?? "").trim() || null,
        priceInputAmountMinor,
        priceInputCurrency: priceInputAmountMinor == null
          ? null
          : String(formData.get("priceInputCurrency") ?? formData.get("purchaseCurrency") ?? "").trim() || preferredCurrency,
        purchasedAt: parseOptionalDate(formData.get("purchasedAt") as string | null),
        freshnessDate: parseOptionalDate(formData.get("freshnessDate") as string | null),
        notes: String(formData.get("notes") ?? "").trim() || null
      });

      await addCustomIngredientToInventory(user.id, payload, { preferredCurrency });
      if (purchaseLinksTouched) {
        await replaceIngredientPurchaseLinksForReference(user.id, {
          source: "custom",
          id: userCustomIngredientId
        }, purchaseLinks);
      }
      revalidatePath("/app/ingredients");
      revalidatePath("/catalog");
      return { ok: true, message: "Ингредиент добавлен в запасы." };
    } catch (error) {
      return mapError(error);
    }
  }

  if (ingredientCatalogItemId) {
    if (!hasDerivedCatalogOverrideRequest) {
      return addCatalogIngredientAction(_prevState, formData);
    }

    try {
      const user = await requireUser();
      const preferredCurrency = user.preferredCurrency ?? "RUB";
      const purchaseLinksTouched = parseBooleanFlag(formData.get("purchaseLinksTouched"));
      const purchaseLinks = purchaseLinksTouched ? parsePurchaseLinksFromFormData(formData) : [];
      const priceInputAmountMinor = parseOptionalMoney(
        formData.get("priceInputAmount")
        ?? formData.get("purchasePrice")
        ?? formData.get("purchasePriceMinor")
      );

      const source = await resolveCatalogInventoryAdditionSource(user.id, {
        ingredientCatalogItemId,
        fermentableColorEbc,
        fermentableExtractYieldPct,
        hopAlphaAcidPct
      });

      if (source.sourceKind === "catalog") {
        return addCatalogIngredientAction(_prevState, formData);
      }

      const payload = addCustomInventoryItemSchema.parse({
        userCustomIngredientId: source.userCustomIngredientId,
        enteredQuantity: String(formData.get("enteredQuantity") ?? ""),
        enteredUnit: String(formData.get("enteredUnit") ?? ""),
        priceInputMode: String(formData.get("priceInputMode") ?? "").trim() || null,
        priceInputAmountMinor,
        priceInputCurrency: priceInputAmountMinor == null
          ? null
          : String(formData.get("priceInputCurrency") ?? formData.get("purchaseCurrency") ?? "").trim() || preferredCurrency,
        purchasedAt: parseOptionalDate(formData.get("purchasedAt") as string | null),
        freshnessDate: parseOptionalDate(formData.get("freshnessDate") as string | null),
        notes: String(formData.get("notes") ?? "").trim() || null
      });

      await addCustomIngredientToInventory(user.id, payload, { preferredCurrency });
      if (purchaseLinksTouched) {
        await replaceIngredientPurchaseLinksForReference(user.id, {
          source: "custom",
          id: source.userCustomIngredientId
        }, purchaseLinks);
      }
      revalidatePath("/app/ingredients");
      revalidatePath("/catalog");
      return { ok: true, message: "Свой вариант ингредиента добавлен в запасы." };
    } catch (error) {
      return mapError(error);
    }
  }

  return {
    ok: false,
    message: "Выберите ингредиент."
  };
};

export const addCustomIngredientAction = async (_prevState: AddIngredientResult | null, formData: FormData): Promise<AddIngredientResult> => {
  try {
    const user = await requireUser();
    const preferredCurrency = user.preferredCurrency ?? "RUB";
    const purchaseLinksTouched = parseBooleanFlag(formData.get("purchaseLinksTouched"));
    const purchaseLinks = purchaseLinksTouched ? parsePurchaseLinksFromFormData(formData) : [];
    const priceInputAmountMinor = parseOptionalMoney(
      formData.get("priceInputAmount")
      ?? formData.get("purchasePrice")
      ?? formData.get("purchasePriceMinor")
    );

    const customPayload = createUserCustomInventoryIngredientSchema.parse({
      type: String(formData.get("type") ?? "") || undefined,
      category: String(formData.get("category") ?? "") || undefined,
      subtype: String(formData.get("subtype") ?? "").trim() || null,
      displayName: String(formData.get("displayName") ?? "").trim(),
      brand: String(formData.get("brand") ?? "").trim() || null,
      country: String(formData.get("country") ?? "").trim() || null,
      harvestYear: String(formData.get("harvestYear") ?? "").trim() || null,
      fermentableColorEbc: String(formData.get("fermentableColorEbc") ?? "").trim() || null,
      fermentableExtractYieldPct: String(formData.get("fermentableExtractYieldPct") ?? "").trim() || null,
      hopAlphaAcidPct: String(formData.get("hopAlphaAcidPct") ?? "").trim() || null,
      hopForm: String(formData.get("hopForm") ?? "").trim() || null,
      yeastAttenuationPct: String(formData.get("yeastAttenuationPct") ?? "").trim() || null,
      yeastForm: String(formData.get("yeastForm") ?? "").trim() || null,
      waterTreatmentConcentrationPct: String(formData.get("waterTreatmentConcentrationPct") ?? "").trim() || null,
      defaultDisplayUnit: String(formData.get("defaultDisplayUnit") ?? "").trim() || null
    });

    const customIngredient = await createUserCustomInventoryIngredient(user.id, customPayload);

    const inventoryPayload = addCustomInventoryItemSchema.parse({
      userCustomIngredientId: customIngredient.id,
      enteredQuantity: String(formData.get("enteredQuantity") ?? ""),
      enteredUnit: String(formData.get("enteredUnit") ?? ""),
      priceInputMode: String(formData.get("priceInputMode") ?? "").trim() || null,
      priceInputAmountMinor,
      priceInputCurrency: priceInputAmountMinor == null
        ? null
        : String(formData.get("priceInputCurrency") ?? formData.get("purchaseCurrency") ?? "").trim() || preferredCurrency,
      purchasedAt: parseOptionalDate(formData.get("purchasedAt") as string | null),
      freshnessDate: parseOptionalDate(formData.get("freshnessDate") as string | null),
      notes: String(formData.get("notes") ?? "").trim() || null
    });

    await addCustomIngredientToInventory(user.id, inventoryPayload, { preferredCurrency });
    if (purchaseLinksTouched) {
      await replaceIngredientPurchaseLinksForReference(user.id, {
        source: "custom",
        id: customIngredient.id
      }, purchaseLinks);
    }

    revalidatePath("/app/ingredients");
    revalidatePath("/catalog");
    return { ok: true, message: "Собственный ингредиент создан и добавлен в запасы." };
  } catch (error) {
    return mapError(error);
  }
};

export const updateInventoryItemAction = async (payload: {
  inventoryItemId: string;
  ingredientCatalogItemId?: string | null;
  userCustomIngredientId?: string | null;
  waterTreatmentConcentrationPct?: string | null;
  enteredQuantity: string;
  enteredUnit: string;
  priceInputMode?: string | null;
  priceInputAmount?: string | null;
  purchasePrice?: string | null;
  purchasePriceMinor?: string | null;
  priceInputCurrency?: string | null;
  purchaseCurrency?: string | null;
  purchasedAt?: string | null;
  freshnessDate?: string | null;
  notes?: string | null;
  purchaseLinks?: string[];
  purchaseLinksTouched?: boolean;
}): Promise<AddIngredientResult> => {
  try {
    const user = await requireUser();
    const preferredCurrency = user.preferredCurrency ?? "RUB";
    const priceInputAmountMinor = parseOptionalMoney(payload.priceInputAmount ?? payload.purchasePrice ?? payload.purchasePriceMinor ?? null);
    const waterTreatmentConcentrationPct = String(payload.waterTreatmentConcentrationPct ?? "").trim() || null;

    const parsed = updateInventoryItemSchema.parse({
      ingredientCatalogItemId: payload.ingredientCatalogItemId ?? null,
      userCustomIngredientId: payload.userCustomIngredientId ?? null,
      enteredQuantity: payload.enteredQuantity,
      enteredUnit: payload.enteredUnit,
      priceInputMode: payload.priceInputMode ?? null,
      priceInputAmountMinor,
      priceInputCurrency: priceInputAmountMinor == null ? null : payload.priceInputCurrency ?? payload.purchaseCurrency ?? preferredCurrency,
      purchasedAt: parseOptionalDate(payload.purchasedAt ?? null),
      freshnessDate: parseOptionalDate(payload.freshnessDate ?? null),
      notes: String(payload.notes ?? "").trim() || null,
      waterTreatmentConcentrationPct
    });

    await updateInventoryItem(user.id, payload.inventoryItemId, parsed, { preferredCurrency });
    if (payload.purchaseLinksTouched) {
      const purchaseLinks = normalizeIngredientPurchaseLinkInputs(payload.purchaseLinks ?? []);
      const reference = parsed.userCustomIngredientId
        ? {
          source: "custom" as const,
          id: parsed.userCustomIngredientId
        }
        : parsed.ingredientCatalogItemId
          ? {
            source: "catalog" as const,
            id: parsed.ingredientCatalogItemId
          }
          : null;

      if (reference) {
        await replaceIngredientPurchaseLinksForReference(user.id, reference, purchaseLinks);
      }
    }
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

export const setInventoryItemEmptyAction = async (inventoryItemId: string): Promise<AddIngredientResult> => {
  try {
    const user = await requireUser();
    await setInventoryItemQuantityToZero(user.id, inventoryItemId);
    revalidatePath("/app/ingredients");

    return { ok: true, message: "Остаток обнулен. Позиция останется в разделе «Пустые»." };
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") {
      return { ok: false, message: "Позиция не найдена или недоступна." };
    }

    return { ok: false, message: "Не удалось обнулить остаток. Попробуйте ещё раз." };
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

    return { ok: false, message: "Не удалось удалить ингредиент. Попробуйте ещё раз." };
  }
};

// Журнал движений по позиции склада — тянется клиентом при открытии деталей
// позиции (UX-находка #19). Ownership проверяет сервис (ensureInventoryItem).
export const getInventoryItemMovementsAction = async (
  inventoryItemId: string
): Promise<{ ok: true; movements: InventoryItemMovementDto[] } | { ok: false; message: string }> => {
  const user = await requireUser();
  try {
    const movements = await listInventoryItemMovements(user.id, inventoryItemId);
    return { ok: true, movements };
  } catch {
    return { ok: false, message: "Не удалось загрузить журнал движений." };
  }
};

export type { AddIngredientResult };
