"use server";

// =============================================================================
//  features/brew-controller/actions.ts
//  Серверные экшены жизненного цикла варки на устройстве. Все ownership-checked:
//  requireUser() из сессии, плюс сверка с переданным userId. Реальная работа
//  с устройством — через провайдер контроллера (getProvider('brewforge')).
// =============================================================================
import {
  cmdSelectRecipe,
  cmdStartBrew,
  cmdStop,
  type Ack,
  type AckReason,
} from "@nb/brewforge-protocol";

import { requireUser } from "@/lib/auth";
import { getBrewBatchById, updateBrewBatchStatus } from "@/features/brew-batches/service";
import type { BrewBatchStatus } from "@/features/brew-batches/contracts";

import { getProvider } from "./index";
import { describeStartBrewError, describeStartBrewNack } from "./messages";

/** Гейт владения: сессия должна совпадать с заявленным userId. */
async function assertOwner(userId: string): Promise<void> {
  const session = await requireUser();
  if (session.id !== userId) {
    throw new Error("FORBIDDEN");
  }
}

/** Эффективный результат запуска варки — честно отражает, начался ли НАГРЕВ. */
export type StartBrewOutcome = {
  /** Запрос обработан без транспортной/ownership-ошибки (партия двинута в 'brewing'). */
  ok: boolean;
  /** Реально ли устройство ЗАПУСТИЛО нагрев (Ack ok на START_BREW). */
  heatingStarted: boolean;
  /** Эффективный статус партии после операции. */
  status: BrewBatchStatus;
  /** Номер слота рецепта на устройстве (externalId из pushRecipe). */
  externalId: string | null;
  slot: number | null;
  /** Ack команды START_BREW (источник истины «пошёл ли нагрев»). */
  ack: Ack | null;
  /** Причина nack (если есть) — для честного UI. */
  reason: AckReason | null;
};

/**
 * Запустить варку на устройстве:
 *   1. проверяем владение партией и устройством;
 *   2. openSession — привязываем партию к устройству (brew_batches.deviceId);
 *   3. pushRecipe — пушим замороженный снимок плана в записываемый слот;
 *   4. START_BREW(slot) — ЯВНАЯ команда старта (пуш рецепта сам по себе нагрев НЕ
 *      запускает!). Ack интерпретируем ЧЕСТНО:
 *        - ok:true                 → нагрев пошёл, статус 'brewing';
 *        - nack REMOTE_DISABLED    → удалённый нагрев выключен на устройстве (opt-in
 *          гейт авторитетен). Дополнительно шлём SELECT_RECIPE(slot) (не-нагревочная),
 *          чтобы пушнутый рецепт стал активным для ручного старта; статус 'brewing',
 *          но heatingStarted:false;
 *        - прочие nack             → варка НЕ началась: не врём про нагрев и НЕ двигаем
 *          статус партии, отдаём причину наверх.
 */
export async function startBrewOnDevice(input: {
  userId: string;
  brewBatchId: string;
  deviceId: string;
}): Promise<StartBrewOutcome> {
  const { userId, brewBatchId, deviceId } = input;
  await assertOwner(userId);

  const batch = await getBrewBatchById(userId, brewBatchId);
  if (!batch) {
    throw new Error("BREW_BATCH_NOT_FOUND");
  }

  const provider = getProvider("brewforge");
  if (!provider?.openSession || !provider.pushRecipe || !provider.sendCommand) {
    throw new Error("PROVIDER_UNAVAILABLE");
  }

  // openSession проверяет владение устройством и проставляет brew_batches.deviceId,
  // на который затем опирается pushRecipe (резолвит устройство через партию).
  await provider.openSession({ userId, deviceId, brewBatchId });

  const { externalId } = await provider.pushRecipe({
    userId,
    brewBatchId,
    brewPlanSnapshot: batch.brewPlanSnapshot
  });

  const parsedSlot = Number.parseInt(externalId ?? "", 10);
  const slot = Number.isFinite(parsedSlot) && parsedSlot >= 0 ? parsedSlot : 0;

  // Пуш рецепта в слот НЕ запускает нагрев — нужна ЯВНАЯ команда START_BREW.
  const ack = await provider.sendCommand({
    userId,
    deviceId,
    brewBatchId,
    command: cmdStartBrew(slot)
  });

  if (ack.ok) {
    await updateBrewBatchStatus(userId, brewBatchId, "brewing");
    return {
      ok: true,
      heatingStarted: true,
      status: "brewing",
      externalId: externalId ?? null,
      slot,
      ack,
      reason: ack.reason
    };
  }

  if (ack.reason === "REMOTE_DISABLED") {
    // Удалённый нагрев выключен на устройстве. Рецепт уже в слоте — делаем его
    // активным (SELECT_RECIPE — не-нагревочная), чтобы пользователь стартовал
    // варку вручную/после включения удалённого управления. Гейт остаётся за устройством.
    await provider.sendCommand({
      userId,
      deviceId,
      brewBatchId,
      command: cmdSelectRecipe(slot)
    });
    await updateBrewBatchStatus(userId, brewBatchId, "brewing");
    return {
      ok: true,
      heatingStarted: false,
      status: "brewing",
      externalId: externalId ?? null,
      slot,
      ack,
      reason: "REMOTE_DISABLED"
    };
  }

  // Прочие nack (интерлок/валидация/очередь/rate-limit): варка НЕ началась.
  return {
    ok: false,
    heatingStarted: false,
    status: batch.status,
    externalId: externalId ?? null,
    slot,
    ack,
    reason: ack.reason
  };
}

/**
 * Остановить варку: шлём STOP на устройство и возвращаем статус партии назад
 * (по умолчанию 'planned'; вызывающий может передать иной статус — например
 * 'cancelled' при отмене или 'fermenting' при штатном завершении затора).
 */
export async function stopBrewOnDevice(input: {
  userId: string;
  brewBatchId: string;
  deviceId: string;
  status?: BrewBatchStatus;
}): Promise<{ ok: boolean; ack: Ack }> {
  const { userId, brewBatchId, deviceId } = input;
  await assertOwner(userId);

  const batch = await getBrewBatchById(userId, brewBatchId);
  if (!batch) {
    throw new Error("BREW_BATCH_NOT_FOUND");
  }

  const provider = getProvider("brewforge");
  if (!provider?.sendCommand) {
    throw new Error("PROVIDER_UNAVAILABLE");
  }

  const ack = await provider.sendCommand({
    userId,
    deviceId,
    brewBatchId,
    command: cmdStop()
  });

  await updateBrewBatchStatus(userId, brewBatchId, input.status ?? "planned");

  return { ok: ack.ok, ack };
}

/** Результат клиентского экшена старта. heatingStarted — реально ли пошёл нагрев. */
export type StartBrewActionResult = {
  ok: boolean;
  message: string;
  heatingStarted: boolean;
  externalId: string | null;
  slot: number | null;
  reason: AckReason | null;
};

/**
 * Клиентский экшен запуска варки на устройстве из мастера рецептов.
 * userId берётся из сессии (requireUser), поэтому клиенту его передавать не нужно;
 * делегирует в startBrewOnDevice (openSession → pushRecipe → START_BREW) и
 * ЧЕСТНО отражает результат: heatingStarted говорит, реально ли пошёл нагрев
 * (при REMOTE_DISABLED рецепт загружен и выбран, но нагрев надо включить на
 * устройстве/запустить вручную). Дашборд партии показывает фактическое состояние
 * по живой телеметрии.
 */
export async function startBrewOnDeviceAction(input: {
  brewBatchId: string;
  deviceId: string;
}): Promise<StartBrewActionResult> {
  try {
    const user = await requireUser();
    const outcome = await startBrewOnDevice({
      userId: user.id,
      brewBatchId: input.brewBatchId,
      deviceId: input.deviceId
    });

    if (outcome.ok && outcome.heatingStarted) {
      return {
        ok: true,
        message: "Рецепт отправлен, варка запущена.",
        heatingStarted: true,
        externalId: outcome.externalId,
        slot: outcome.slot,
        reason: outcome.reason
      };
    }

    if (outcome.ok && outcome.reason === "REMOTE_DISABLED") {
      return {
        ok: true,
        message: `Рецепт загружен в слот ${outcome.slot ?? 0} и выбран. Включите удалённое управление на устройстве или запустите варку вручную.`,
        heatingStarted: false,
        externalId: outcome.externalId,
        slot: outcome.slot,
        reason: outcome.reason
      };
    }

    // nack — честно сообщаем причину; нагрев НЕ запущен, статус партии не двинут.
    return {
      ok: false,
      message: describeStartBrewNack(outcome.reason),
      heatingStarted: false,
      externalId: outcome.externalId,
      slot: outcome.slot,
      reason: outcome.reason
    };
  } catch (error) {
    return {
      ok: false,
      message: describeStartBrewError(error),
      heatingStarted: false,
      externalId: null,
      slot: null,
      reason: null
    };
  }
}
