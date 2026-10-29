import type { Command } from "@nb/brewforge-protocol";

import { commandRequiresFreshTelemetry, commandRequiresLease } from "./command-gate";
import { holdsValidLease } from "./control-lease";

/** Общая серверная проверка для API, Server Actions и самой отправки команды. */
export async function assertDeviceCommandAuthorized(input: {
  userId: string;
  deviceId: string;
  providerId: string;
  sessionId?: string;
  command: Command;
}): Promise<void> {
  const needsLease = commandRequiresLease(input.command);
  const sessionId = typeof input.sessionId === "string" && input.sessionId.length <= 128 ? input.sessionId : "";
  const identity = { userId: input.userId, sessionId };
  if (needsLease && (!identity.sessionId || !await holdsValidLease(input.deviceId, identity))) {
    throw new Error("NO_CONTROL_LEASE");
  }

  if (commandRequiresFreshTelemetry(input.command)) {
    // Кеш читает реестр провайдеров. Загружаем после инициализации провайдера,
    // чтобы не создать цикл provider → guard → cache → registry → provider.
    const { readFreshTelemetry } = await import("./device-telemetry-cache");
    const fresh = await readFreshTelemetry({
      userId: input.userId, deviceId: input.deviceId, providerId: input.providerId
    });
    if (!fresh) throw new Error("DEVICE_STALE");
    // Чтение может занять секунды: аренда могла истечь или быть освобождена.
    if (needsLease && !await holdsValidLease(input.deviceId, identity)) {
      throw new Error("NO_CONTROL_LEASE");
    }
  }
}
