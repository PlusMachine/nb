import { and, asc, db, deviceRecipeSlots, eq } from "@nb/db";
import type { DeviceRecipe } from "@nb/brewforge-protocol";

import { getProviderForDevice } from "@/features/brew-controller";
import type { DeviceDto } from "./contracts";
import { buildBrewPlanSnapshot } from "@/features/brew-batches/brew-plan";
import { getOwnedRecipeById, listRecipesForAuthor } from "@/features/recipes/service";

import { getDeviceById } from "./service";
import { mergeOnboardSlots } from "./onboard-recipes-merge";
import type {
  OnboardSlotDto,
  PushableRecipeDto,
  PushRecipeToSlotResult
} from "./onboard-recipes-contracts";

// =============================================================================
//  features/devices/onboard-recipes.ts
//  Сервис «рецептов на борту» (Phase 4): читаем что лежит в слотах устройства
//  (read-only снапшот «с платы») и пушим nb-рецепт НА плату с привязкой
//  слот↔recipeId (таблица device_recipe_slots). Все операции ownership-checked
//  (getDeviceById по userId). Мост «рецепт nb → снимок плана → нативный рецепт →
//  слот»: getOwnedRecipeById → buildBrewPlanSnapshot → provider.pushRecipeToDevice.
//
//  ЧЕСТНОСТЬ (решение дизайна §5): pull = read-only снапшот «что на плате», НЕ
//  импорт в каталог (DeviceRecipe беднее модели nb — нет засыпи/дрожжей/воды).
//  Двусторонний обмен только через привязку слот↔исходный recipeId, без реверс-
//  маппинга DeviceRecipe→рецепт nb.
// =============================================================================

/** Провайдер устройства (per-device dispatch по providerId), иначе доменная ошибка. */
function requireProvider(device: DeviceDto) {
  const provider = getProviderForDevice(device);
  if (!provider) {
    throw new Error("PROVIDER_UNAVAILABLE");
  }
  return provider;
}

/** Устройство пользователя (ownership) или доменная ошибка NOT_FOUND. */
async function requireDevice(userId: string, deviceId: string) {
  const device = await getDeviceById(userId, deviceId);
  if (!device) {
    throw new Error("NOT_FOUND");
  }
  return device;
}

/**
 * Список слотов устройства с привязками к рецептам nb. Слоты (source of truth
 * занятости/имени на плате) берём из provider.listSlots; привязку слот↔recipeId —
 * из device_recipe_slots и мёржим по номеру слота. Может бросить CLOUD_UNSUPPORTED
 * (listSlots недоступен по облаку) — роут переведёт это в понятный ответ.
 */
export const getOnboardRecipes = async (
  userId: string,
  deviceId: string
): Promise<OnboardSlotDto[]> => {
  const device = await requireDevice(userId, deviceId);
  const provider = requireProvider(device);
  if (!provider.listSlots) {
    throw new Error("PROVIDER_UNAVAILABLE");
  }

  const slots = await provider.listSlots({ userId, deviceId: device.id });

  const bindings = await db
    .select({
      slot: deviceRecipeSlots.slot,
      recipeId: deviceRecipeSlots.recipeId,
      recipeName: deviceRecipeSlots.recipeName,
      pushedAt: deviceRecipeSlots.pushedAt
    })
    .from(deviceRecipeSlots)
    .where(eq(deviceRecipeSlots.deviceId, device.id))
    .orderBy(asc(deviceRecipeSlots.slot));

  return mergeOnboardSlots(slots, bindings);
};

/**
 * Read-only снапшот «что лежит на плате» в слоте (нативный DeviceRecipe). null —
 * слот пуст или снапшот недоступен. Не импорт в каталог — только просмотр.
 */
export const getSlotSnapshot = async (
  userId: string,
  deviceId: string,
  slot: number
): Promise<DeviceRecipe | null> => {
  const device = await requireDevice(userId, deviceId);
  const provider = requireProvider(device);
  if (!provider.readSlotSnapshot) {
    throw new Error("PROVIDER_UNAVAILABLE");
  }
  return provider.readSlotSnapshot({ userId, deviceId: device.id, slot });
};

/**
 * Пуш nb-рецепта НА плату в целевой слот (device-first, БЕЗ партии варки).
 * Резолвит рецепт (ownership) → строит снимок плана → просит провайдер записать в
 * слот → фиксирует привязку слот↔recipeId (upsert по (deviceId, slot)). recipeName
 * денормализуем на момент пуша (переживёт удаление/переименование рецепта).
 * Привязку пишем к ВЕРНУВШЕМУСЯ слоту (source of truth от устройства).
 */
export const pushRecipeToSlot = async (
  userId: string,
  deviceId: string,
  recipeId: string,
  slot?: number
): Promise<PushRecipeToSlotResult> => {
  const device = await requireDevice(userId, deviceId);
  const provider = requireProvider(device);
  if (!provider.pushRecipeToDevice) {
    throw new Error("PROVIDER_UNAVAILABLE");
  }

  // getOwnedRecipeById бросит NOT_FOUND, если рецепт не найден/не принадлежит юзеру.
  const recipe = await getOwnedRecipeById(userId, recipeId);
  const brewPlanSnapshot = buildBrewPlanSnapshot(recipe);

  const { slot: written } = await provider.pushRecipeToDevice({
    userId,
    deviceId: device.id,
    brewPlanSnapshot,
    slot
  });

  const now = new Date();
  await db
    .insert(deviceRecipeSlots)
    .values({
      deviceId: device.id,
      userId,
      slot: written,
      recipeId: recipe.id,
      recipeName: recipe.title,
      pushedAt: now,
      updatedAt: now
    })
    .onConflictDoUpdate({
      target: [deviceRecipeSlots.deviceId, deviceRecipeSlots.slot],
      set: {
        userId,
        recipeId: recipe.id,
        recipeName: recipe.title,
        pushedAt: now,
        updatedAt: now
      }
    });

  return { slot: written, boundRecipeId: recipe.id, boundRecipeName: recipe.title };
};

/**
 * Компактный список рецептов пользователя для пикера «записать на плату».
 * Тонкая обёртка над listRecipesForAuthor (рабочая зона) с проекцией в лёгкий DTO.
 */
export const listPushableRecipes = async (userId: string): Promise<PushableRecipeDto[]> => {
  const rows = await listRecipesForAuthor(userId, { limit: 100 });
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    versionNumber: r.versionNumber,
    og: r.og,
    abv: r.abv
  }));
};
