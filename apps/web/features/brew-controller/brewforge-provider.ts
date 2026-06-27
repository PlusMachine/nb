// =============================================================================
//  features/brew-controller/brewforge-provider.ts
//  Конкретный провайдер контроллера BrewForge (реализует BrewforgeProvider).
//  Достаёт строку устройства из @nb/db, выбирает LAN-транспорт (device.localUrl
//  + per-device токен), переводит снимок плана в нативный рецепт и пушит его,
//  читает телеметрию, отправляет команды (с аудитом в device_commands) и ведёт
//  хуки сессии. Открытый токен НЕ храним и НЕ логируем (в БД только token_hash).
// =============================================================================
import { and, brewBatches, brewDevices, db, deviceCommands, eq } from "@nb/db";
import {
  CommandSchema,
  DeviceConfigPatchSchema,
  type Command,
} from "@nb/brewforge-protocol";

import type {
  BrewforgeProvider,
  CloseSessionFn,
  OpenSessionFn,
  PushRecipeFn,
  ReadConfigFn,
  ReadTelemetryFn,
  SendCommandFn,
  WriteConfigFn,
} from "./contracts";
import { brewPlanV1ToDeviceRecipe } from "./translator";
import { lanTransport, type DeviceTransport } from "./transport";

type DeviceRow = typeof brewDevices.$inferSelect;

/** Загрузить устройство пользователя по id (или бросить, если нет/чужое). */
async function loadDevice(userId: string, deviceId: string): Promise<DeviceRow> {
  const [device] = await db
    .select()
    .from(brewDevices)
    .where(and(eq(brewDevices.id, deviceId), eq(brewDevices.userId, userId)))
    .limit(1);
  if (!device) throw new Error("DEVICE_NOT_FOUND");
  return device;
}

/**
 * Безопасный brewBatchId для строки аудита device_commands: возвращает id только
 * если партия принадлежит ЭТОМУ пользователю И привязана к ЭТОМУ устройству.
 * Иначе null (не даём навесить аудит-команду на чужую/несвязанную партию).
 */
async function resolveAuditBatchId(
  userId: string,
  deviceId: string,
  brewBatchId: string | undefined
): Promise<string | null> {
  if (!brewBatchId) return null;
  const [batch] = await db
    .select({ id: brewBatches.id })
    .from(brewBatches)
    .where(
      and(
        eq(brewBatches.id, brewBatchId),
        eq(brewBatches.userId, userId),
        eq(brewBatches.deviceId, deviceId)
      )
    )
    .limit(1);
  return batch?.id ?? null;
}

/** Найти устройство, привязанное к партии варки (через brew_batches.deviceId). */
async function loadBatchDeviceId(userId: string, brewBatchId: string): Promise<string> {
  const [batch] = await db
    .select({ deviceId: brewBatches.deviceId })
    .from(brewBatches)
    .where(and(eq(brewBatches.id, brewBatchId), eq(brewBatches.userId, userId)))
    .limit(1);
  if (!batch) throw new Error("BREW_BATCH_NOT_FOUND");
  if (!batch.deviceId) throw new Error("BREW_BATCH_NO_DEVICE");
  return batch.deviceId;
}

/**
 * Открытый per-device токен для LAN-аутентификации. В БД лежит ТОЛЬКО хэш
 * (token_hash) — открытый токен сюда не пишем и не логируем. Берём из защищённого
 * источника (env-секрет на устройство, затем общий dev-фолбэк).
 * TODO: подключить реальное хранилище секретов вместо env.
 */
function resolveDeviceToken(device: DeviceRow): string | undefined {
  const perDevice = process.env[`BREWFORGE_DEVICE_TOKEN_${device.id}`];
  if (perDevice && perDevice.length > 0) return perDevice;
  const shared = process.env.BREWFORGE_DEVICE_TOKEN;
  return shared && shared.length > 0 ? shared : undefined;
}

/** Транспорт к устройству. Пока единственный путь — LAN-REST по localUrl. */
function transportForDevice(device: DeviceRow): DeviceTransport {
  if (!device.localUrl) throw new Error("DEVICE_NO_LOCAL_URL");
  return lanTransport(device.localUrl, resolveDeviceToken(device));
}

// --- Методы провайдера ------------------------------------------------------

const pushRecipe: PushRecipeFn = async ({ userId, brewBatchId, brewPlanSnapshot }) => {
  const deviceId = await loadBatchDeviceId(userId, brewBatchId);
  const device = await loadDevice(userId, deviceId);
  const transport = transportForDevice(device);
  const recipe = brewPlanV1ToDeviceRecipe(brewPlanSnapshot);
  const { slot } = await transport.putRecipe(recipe);
  // externalId — номер слота, в который лёг рецепт (для последующего START_BREW).
  return { externalId: String(slot) };
};

const readTelemetry: ReadTelemetryFn = async ({ userId, deviceId }) => {
  const device = await loadDevice(userId, deviceId);
  return transportForDevice(device).getTelemetry();
};

const sendCommand: SendCommandFn = async ({ userId, deviceId, brewBatchId, command }) => {
  const device = await loadDevice(userId, deviceId);

  const parsed = CommandSchema.safeParse(command);
  if (!parsed.success) {
    throw new Error(`INVALID_COMMAND: ${parsed.error.message}`);
  }
  const cmd: Command = parsed.data;

  // Скоупинг brewBatchId: принимаем его в аудит только если партия принадлежит
  // этому пользователю и привязана к этому устройству; иначе обнуляем.
  const auditBatchId = await resolveAuditBatchId(userId, device.id, brewBatchId);

  // Аудит: queued. arg кладём как есть (union bf_cmd_t.arg ~ Record).
  const [audit] = await db
    .insert(deviceCommands)
    .values({
      deviceId: device.id,
      brewBatchId: auditBatchId,
      userId,
      type: cmd.type,
      arg: cmd.arg ?? null,
      status: "queued",
    })
    .returning({ id: deviceCommands.id });
  const auditId = audit?.id;

  try {
    if (auditId) {
      await db
        .update(deviceCommands)
        .set({ status: "sent" })
        .where(eq(deviceCommands.id, auditId));
    }

    const ack = await transportForDevice(device).sendCommand(cmd);

    if (auditId) {
      await db
        .update(deviceCommands)
        .set({ status: ack.ok ? "acked" : "failed", reason: ack.reason, ackedAt: new Date() })
        .where(eq(deviceCommands.id, auditId));
    }
    return ack;
  } catch (error) {
    if (auditId) {
      const reason = error instanceof Error ? error.message.slice(0, 200) : "TRANSPORT_ERROR";
      await db
        .update(deviceCommands)
        .set({ status: "failed", reason })
        .where(eq(deviceCommands.id, auditId));
    }
    throw error;
  }
};

// readConfig — прочитать НЕсекретный конфиг §6.3 устройства (ownership-checked).
const readConfig: ReadConfigFn = async ({ userId, deviceId }) => {
  const device = await loadDevice(userId, deviceId);
  return transportForDevice(device).getConfig();
};

// writeConfig — записать (под)множество полей конфига. Валидируем форму на портале
// (DeviceConfigPatchSchema), но БЕЗОПАСНЫЙ КЛАМПИНГ и интерлоки §5 — на устройстве:
// прошивка обрезает каждое поле в безопасный диапазон и применяет ПОСЛЕ перезагрузки.
const writeConfig: WriteConfigFn = async ({ userId, deviceId, config }) => {
  const device = await loadDevice(userId, deviceId);
  const parsed = DeviceConfigPatchSchema.safeParse(config);
  if (!parsed.success) {
    throw new Error(`INVALID_CONFIG: ${parsed.error.message}`);
  }
  return transportForDevice(device).putConfig(parsed.data);
};

// openSession — привязываем партию к устройству (идемпотентно): pushRecipe затем
// находит устройство через brew_batches.deviceId.
const openSession: OpenSessionFn = async ({ userId, deviceId, brewBatchId }) => {
  await loadDevice(userId, deviceId); // проверка владения устройством
  await db
    .update(brewBatches)
    .set({ deviceId, updatedAt: new Date() })
    .where(and(eq(brewBatches.id, brewBatchId), eq(brewBatches.userId, userId)));
};

// closeSession — пока no-op: связь партия↔устройство оставляем для истории
// (телеметрия/лог ссылаются на оба id). Проверяем только владение устройством.
const closeSession: CloseSessionFn = async ({ userId, deviceId }) => {
  await loadDevice(userId, deviceId);
};

export const brewforgeProvider: BrewforgeProvider = {
  id: "brewforge",
  label: "BrewForge",
  enabled: true,
  capabilities: [
    "telemetry",
    "manual_control",
    "profile_push",
    "recipe_push",
    "live_session_control",
    "fermentation_logging",
    "brew_logging",
  ],
  pushRecipe,
  readTelemetry,
  sendCommand,
  openSession,
  closeSession,
  readConfig,
  writeConfig,
};
