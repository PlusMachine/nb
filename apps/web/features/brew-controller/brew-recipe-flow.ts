"use server";

// =============================================================================
//  features/brew-controller/brew-recipe-flow.ts
//  Композиция «Сварить на автоматике» ПРЯМО из рецепта (единый вход «Сварить»,
//  автоматическая ветка): создаёт партию варки из рецепта (свой любой статус
//  или чужой published, БЕЗ клонирования — ownership по партии) и сразу
//  запускает её на устройстве. Домен не меняем — только сшиваем два уже
//  существующих серверных примитива в один клиентский экшен:
//    createBrewBatchFromRecipe (features/brew-batches/service.ts)
//      → startBrewOnDevice (features/brew-controller/actions.ts)
//  Используется и из публичной витрины, и из дашборда/редактора рецептов, и с
//  пульта устройства (там deviceId уже известен — экран выбора устройства не
//  нужен, это делает вызывающий UI).
// =============================================================================
import type { AckReason } from "@nb/brewforge-protocol";

import { requireUser } from "@/lib/auth";
import { createBrewBatchFromRecipe } from "@/features/brew-batches/service";

import { startBrewOnDevice } from "./actions";
import { describeStartBrewError, describeStartBrewNack } from "./messages";

export type StartBrewOnDeviceFromRecipeResult = {
  /** Партия создана; heatingStarted говорит, реально ли пошёл нагрев. */
  ok: boolean;
  /** Человекочитаемое сообщение — в т.ч. честный текст для REMOTE_DISABLED. */
  message: string;
  /** Реально ли устройство запустило нагрев (Ack ok на START_BREW). */
  heatingStarted: boolean;
  /** id созданной партии — есть, если createBrewBatchFromRecipe успел отработать. */
  brewBatchId: string | null;
  reason: AckReason | null;
};

/**
 * Клиентский экшен: рецепт → партия → запуск варки на устройстве, одним вызовом.
 * userId — только из сессии (requireUser), клиент его не передаёт. Ошибки
 * создания партии (рецепт недоступен/чужой непубличный) и ошибки запуска на
 * устройстве переиспользуют общую карту сообщений (messages.ts) — тот же
 * словарь, что и у startBrewOnDeviceAction (запуск из уже существующей партии).
 */
export async function startBrewOnDeviceFromRecipeAction(input: {
  recipeId: string;
  deviceId: string;
  /** Ключ идемпотентности создания партии (двойной клик/ретрай → одна партия). */
  idempotencyKey?: string;
}): Promise<StartBrewOnDeviceFromRecipeResult> {
  let brewBatchId: string | null = null;
  try {
    const user = await requireUser();
    const batch = await createBrewBatchFromRecipe(user.id, input.recipeId, {
      idempotencyKey: input.idempotencyKey
    });
    brewBatchId = batch.id;

    const outcome = await startBrewOnDevice({
      userId: user.id,
      brewBatchId: batch.id,
      deviceId: input.deviceId
    });

    if (outcome.ok && outcome.heatingStarted) {
      return {
        ok: true,
        message: "Рецепт отправлен, варка запущена.",
        heatingStarted: true,
        brewBatchId,
        reason: outcome.reason
      };
    }

    if (outcome.ok && outcome.reason === "REMOTE_DISABLED") {
      // Удалённый нагрев выключен на устройстве — партия уже создана и переведена
      // в 'brewing' (см. startBrewOnDevice), рецепт выбран в слоте. Честно
      // сообщаем — переход к партии только по клику пользователя, не молча.
      return {
        ok: true,
        message: `Рецепт загружен в слот ${outcome.slot ?? 0} и выбран. Включите удалённое управление на устройстве или запустите варку вручную.`,
        heatingStarted: false,
        brewBatchId,
        reason: outcome.reason
      };
    }

    // Прочие nack: варка не началась, статус партии не двинут доменной логикой.
    return {
      ok: false,
      message: describeStartBrewNack(outcome.reason),
      heatingStarted: false,
      brewBatchId,
      reason: outcome.reason
    };
  } catch (error) {
    return {
      ok: false,
      message: describeStartBrewError(error),
      heatingStarted: false,
      brewBatchId,
      reason: null
    };
  }
}
