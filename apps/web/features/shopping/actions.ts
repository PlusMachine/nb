"use server";

// =============================================================================
//  features/shopping/actions.ts
//  П1: серверные экшены ручных позиций («Своё») в /app/shopping. Тонкая
//  обёртка над service.ts — requireUser() (клиент не передаёт userId),
//  доменные ошибки маппятся в понятные сообщения (паттерн
//  app/(app)/app/ingredients/actions.ts), а не эхоятся сырым .message.
// =============================================================================
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";

import { requireUser } from "@/lib/auth";
import { pluralize } from "@/lib/pluralize";

import {
  SHOPPING_LINE_CHECK_MAX_COUNT_PER_USER,
  SHOPPING_MANUAL_ITEM_MAX_COUNT_PER_USER,
  toggleShoppingLineCheckedSchema,
  transferCheckedToStockSchema,
  type ShoppingManualItemDto
} from "./contracts";
import {
  addManualShoppingItem,
  deleteManualShoppingItem,
  toggleManualShoppingItem,
  toggleShoppingLineChecked,
  transferCheckedToStock,
  updateManualShoppingItem
} from "./service";
// Барьер квоты склада — то же сообщение, что и на /app/ingredients (mapError
// там же). INVENTORY_ITEM_CREATE_RATE_LIMIT переиспользуется как потолок
// размера ОДНОЙ пачки переноса (см. TRANSFER_TOO_MANY_LINES в service.ts).
import { INVENTORY_ITEM_CREATE_RATE_LIMIT, INVENTORY_ITEM_MAX_COUNT_PER_USER } from "../inventory/contracts";

type ShoppingItemActionResult =
  | { ok: true; message: string; item: ShoppingManualItemDto }
  | { ok: false; message: string; fieldErrors?: Record<string, string>; code?: "RATE_LIMITED" | "QUOTA_REACHED" };

type ShoppingVoidActionResult =
  | { ok: true; message: string }
  | { ok: false; message: string; code?: "RATE_LIMITED" | "QUOTA_REACHED" };

type TransferShoppingActionResult =
  | { ok: true; message: string; transferredCount: number; skippedCount: number }
  | { ok: false; message: string; fieldErrors?: Record<string, string> };

// Ручные позиции видны и в разделе «Чего не хватает», и в счётчике/виджете
// дашборда — обе страницы должны увидеть свежие данные после мутации.
const revalidateShoppingPaths = () => {
  revalidatePath("/app/shopping");
  revalidatePath("/app");
};

const mapShoppingError = (error: unknown): { ok: false; message: string; fieldErrors?: Record<string, string>; code?: "RATE_LIMITED" | "QUOTA_REACHED" } => {
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
    if (error.message === "RATE_LIMITED") {
      return { ok: false, message: "Слишком много добавлений подряд. Немного подождите.", code: "RATE_LIMITED" };
    }
    if (error.message === "SHOPPING_MANUAL_ITEM_QUOTA_REACHED") {
      return {
        ok: false,
        message: `Достигнут предел числа ручных позиций (${SHOPPING_MANUAL_ITEM_MAX_COUNT_PER_USER}). Удалите ненужные, чтобы добавлять новые.`,
        code: "QUOTA_REACHED"
      };
    }
    if (error.message === "NOT_FOUND") {
      return { ok: false, message: "Позиция не найдена или недоступна." };
    }
    if (error.message === "SHOPPING_LINE_CHECK_QUOTA_REACHED") {
      return {
        ok: false,
        message: `Слишком много отметок «куплено» (${SHOPPING_LINE_CHECK_MAX_COUNT_PER_USER}). Снимите лишние.`,
        code: "QUOTA_REACHED"
      };
    }
    if (error.message === "TRANSFER_TOO_MANY_LINES") {
      return {
        ok: false,
        message: `За один перенос — не больше ${INVENTORY_ITEM_CREATE_RATE_LIMIT} позиций. Снимите часть отметок.`
      };
    }
    // П2: перенос купленного на склад идёт через тот же add-путь, что и модалка
    // /app/ingredients (addCatalogIngredientToInventory/addCustomIngredientToInventory) —
    // те же доменные ошибки могут вылететь и здесь (см. mapError в
    // app/(app)/app/ingredients/actions.ts, сообщения синхронизированы).
    if (error.message === "INVENTORY_ITEM_QUOTA_REACHED") {
      return {
        ok: false,
        message: `Достигнут предел числа позиций склада (${INVENTORY_ITEM_MAX_COUNT_PER_USER}). Удалите ненужные, чтобы добавлять новые.`,
        code: "QUOTA_REACHED"
      };
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
    if (error.message === "PACKAGE_VARIANT_NOT_FOUND") {
      return { ok: false, message: "Выбранная фасовка не найдена." };
    }
    if (error.message === "INVALID_SOURCE_LINKAGE") {
      return { ok: false, message: "Выберите корректный ингредиент для сохранения." };
    }
  }

  return { ok: false, message: "Не удалось выполнить действие. Попробуйте ещё раз." };
};

export const addManualShoppingItemAction = async (input: unknown): Promise<ShoppingItemActionResult> => {
  try {
    const user = await requireUser();
    const item = await addManualShoppingItem(user.id, input);
    revalidateShoppingPaths();
    return { ok: true, message: "Позиция добавлена.", item };
  } catch (error) {
    return mapShoppingError(error);
  }
};

export const updateManualShoppingItemAction = async (id: string, input: unknown): Promise<ShoppingItemActionResult> => {
  try {
    const user = await requireUser();
    const item = await updateManualShoppingItem(user.id, id, input);
    revalidateShoppingPaths();
    return { ok: true, message: "Позиция обновлена.", item };
  } catch (error) {
    return mapShoppingError(error);
  }
};

export const deleteManualShoppingItemAction = async (id: string): Promise<ShoppingVoidActionResult> => {
  try {
    const user = await requireUser();
    await deleteManualShoppingItem(user.id, id);
    revalidateShoppingPaths();
    return { ok: true, message: "Позиция удалена." };
  } catch (error) {
    return mapShoppingError(error);
  }
};

export const toggleManualShoppingItemAction = async (id: string, checked: boolean): Promise<ShoppingItemActionResult> => {
  try {
    const user = await requireUser();
    const item = await toggleManualShoppingItem(user.id, id, checked);
    revalidateShoppingPaths();
    return { ok: true, message: "Отметка обновлена.", item };
  } catch (error) {
    return mapShoppingError(error);
  }
};

// П2: отметка «куплено» на производной строке §3.2 — молча (в магазине связь
// плохая, оптимистичный чекбокс в ShoppingLineRow не ждёт тост на успехе).
export const toggleShoppingLineCheckedAction = async (
  lineKey: unknown,
  checked: boolean
): Promise<ShoppingVoidActionResult> => {
  try {
    const parsed = toggleShoppingLineCheckedSchema.parse({ lineKey, checked });
    const user = await requireUser();
    await toggleShoppingLineChecked(user.id, parsed.lineKey, parsed.checked);
    revalidateShoppingPaths();
    return { ok: true, message: "Отметка обновлена." };
  } catch (error) {
    return mapShoppingError(error);
  }
};

// П2: перенос отмеченных строк на склад — единственный сабмит диалога
// «Пополнить склад». Ревалидация захватывает /app/ingredients: перенос создаёт
// позиции склада, «Запасы» должны увидеть их сразу после тоста.
export const transferCheckedToStockAction = async (input: unknown): Promise<TransferShoppingActionResult> => {
  try {
    const parsed = transferCheckedToStockSchema.parse(input);
    const user = await requireUser();
    const result = await transferCheckedToStock(user.id, parsed.lines);

    if (result.transferredCount === 0) {
      return { ok: false, message: "Нечего переносить — отметки устарели, обновите список." };
    }

    revalidatePath("/app/shopping");
    revalidatePath("/app");
    revalidatePath("/app/ingredients");

    return {
      ok: true,
      message: `Склад пополнен: ${result.transferredCount} ${pluralize(result.transferredCount, ["позиция", "позиции", "позиций"])}`,
      transferredCount: result.transferredCount,
      skippedCount: result.skippedCount
    };
  } catch (error) {
    return mapShoppingError(error);
  }
};

export type { ShoppingItemActionResult, ShoppingVoidActionResult, TransferShoppingActionResult };
