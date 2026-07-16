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
import {
  consumeBrewBatchInventoryForStart,
  type StartBrewConsumeResult
} from "@/features/brew-batches/inventory";

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
  /** Итог опционального списания склада (см. input.consumeIngredients) — есть,
   *  только если списание запрашивалось. Списание — факт создания партии, не
   *  зависит от того, пошёл ли нагрев (heatingStarted/REMOTE_DISABLED/иной nack). */
  consume?: StartBrewConsumeResult;
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
  /** Объём варки и оборудование — тот же выбор, что и в ручной ветке (диалог «Сварить»). */
  targetBatchVolumeL?: number;
  equipmentProfileId?: string;
  /** «Сварить на автоматике» — списать ингредиенты рецепта со склада текущего
   *  пользователя сразу при старте (тот же чекбокс, что и в виртуальной ветке). */
  consumeIngredients?: boolean;
}): Promise<StartBrewOnDeviceFromRecipeResult> {
  let brewBatchId: string | null = null;
  // Списание фиксируется в БД ДО вызова устройства — поэтому его результат нужен
  // и в catch (устройство бросило DEVICE_NOT_FOUND/NOT_CAPABLE/сеть): партия уже
  // создана и склад уже списан, UI обязан это показать, а не потерять.
  let consume: StartBrewConsumeResult | undefined;
  try {
    const user = await requireUser();
    const batch = await createBrewBatchFromRecipe(user.id, input.recipeId, {
      idempotencyKey: input.idempotencyKey,
      targetBatchVolumeL: input.targetBatchVolumeL,
      equipmentProfileId: input.equipmentProfileId
    });
    brewBatchId = batch.id;

    // Списание — факт создания партии, не факт старта нагрева: прокидываем его
    // во ВСЕ исходящие результаты ниже (heatingStarted/REMOTE_DISABLED/иной nack),
    // а не только в happy path.
    consume = input.consumeIngredients
      ? await consumeBrewBatchInventoryForStart(user.id, batch.id)
      : undefined;

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
        reason: outcome.reason,
        consume
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
        reason: outcome.reason,
        consume
      };
    }

    // Прочие nack: варка не началась, статус партии не двинут доменной логикой.
    return {
      ok: false,
      message: describeStartBrewNack(outcome.reason),
      heatingStarted: false,
      brewBatchId,
      reason: outcome.reason,
      consume
    };
  } catch (error) {
    return {
      ok: false,
      message: describeStartBrewError(error),
      heatingStarted: false,
      brewBatchId,
      reason: null,
      consume
    };
  }
}
