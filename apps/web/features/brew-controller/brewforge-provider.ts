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
  BrewControllerProvider,
  BrewforgeProvider,
  CloseSessionFn,
  ListSlotsFn,
  OpenSessionFn,
  PushRecipeFn,
  PushRecipeToDeviceFn,
  ReadConfigFn,
  ReadSlotSnapshotFn,
  ReadTelemetryFn,
  SendCommandFn,
  WriteConfigFn,
} from "./contracts";
import { BREWFORGE_DEMO_PROVIDER_ID, BREWFORGE_PROVIDER_ID } from "./contracts";
import { brewPlanV1ToDeviceRecipe } from "./translator";
import { lanTransport, type DeviceTransport } from "./transport";
import { cloudTransport } from "./cloud-transport";
import { simTransport } from "./sim-transport";
import { isCloudTransportEnabled } from "./mqtt-client";
import type { DeviceChannel } from "./telemetry-source";

type DeviceRow = typeof brewDevices.$inferSelect;

/** uuid v-агностичный матч (для решения, можно ли взять cmd.id как id строки аудита). */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Переменная окружения «включена», если задана непустым не-ложным значением. */
const isEnvEnabled = (value: string | undefined): boolean =>
  value !== undefined && value !== "" && value !== "0" && value.toLowerCase() !== "false";

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

/**
 * Облако предпочитаем, когда у портала есть брокер (BREWFORGE_MQTT_URL/MQTT_URL) И
 * либо у устройства нет LAN-адреса (достижимо только через брокер), либо задан
 * BREWFORGE_PREFER_CLOUD (гнать всё через облако — напр. на cloud-деплое nb, где
 * LAN-адрес из домашней сети пользователя сервером недостижим). Иначе — LAN-REST.
 */
function shouldUseCloudTransport(device: { localUrl: string | null }): boolean {
  if (!isCloudTransportEnabled()) return false;
  if (isEnvEnabled(process.env.BREWFORGE_PREFER_CLOUD)) return true;
  return !device.localUrl;
}

/**
 * Канал связи с устройством (честная индикация, Phase 6c). Зеркалит порядок веток
 * transportForDevice (демо → облако → LAN) — источник истины для UI-бейджа «канал».
 */
export function deviceChannel(device: { providerId: string; localUrl: string | null }): DeviceChannel {
  if (device.providerId === BREWFORGE_DEMO_PROVIDER_ID) return "demo";
  if (shouldUseCloudTransport(device)) return "cloud";
  return "lan";
}

/**
 * Транспорт к устройству: прод-демо (in-process SimDevice), облако (через брокер/
 * мост) либо LAN-REST по localUrl. Демо-ветка ПЕРВАЯ и не смотрит на localUrl/облако —
 * стаб полностью локальный (Phase 4.5). Так один провайдер обслуживает и железо, и
 * демо, а вся ownership/audit-логика ниже переиспользуется без изменений.
 */
function transportForDevice(device: DeviceRow): DeviceTransport {
  const channel = deviceChannel(device);
  if (channel === "demo") {
    return simTransport(device.id);
  }
  if (channel === "cloud") {
    return cloudTransport({ id: device.id, hardwareId: device.hardwareId });
  }
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

// pushRecipeToDevice — device-first push рецепта nb в целевой слот (Phase 4), БЕЗ
// партии варки. Резолвит устройство напрямую по deviceId (ownership-checked),
// транслирует замороженный снимок плана в нативный DeviceRecipe и пишет в слот.
// Привязку слот↔recipeId (device_recipe_slots) ведёт вызывающий сервис (у него
// есть recipeId/имя); здесь — только data-plane «записать на плату».
const pushRecipeToDevice: PushRecipeToDeviceFn = async ({
  userId,
  deviceId,
  brewPlanSnapshot,
  slot,
}) => {
  const device = await loadDevice(userId, deviceId);
  const transport = transportForDevice(device);
  const recipe = brewPlanV1ToDeviceRecipe(brewPlanSnapshot);
  const { slot: written } = await transport.putRecipe(recipe, slot);
  return { slot: written };
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
  // id строки = cmd.id (если это валидный uuid), чтобы мост мог финализировать её
  // по ack.ackOf (== cmd.id) для облачного пути — иначе его UPDATE ... WHERE
  // id == ack.ackOf не матчит, и облачный ack не лёг бы в аудит. При нестандартном
  // id команды — db-дефолт (defaultRandom); тогда финализирует только провайдер.
  const [audit] = await db
    .insert(deviceCommands)
    .values({
      ...(UUID_RE.test(cmd.id) ? { id: cmd.id } : {}),
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

// listSlots — карта слотов устройства (ownership-checked).
const listSlots: ListSlotsFn = async ({ userId, deviceId }) => {
  const device = await loadDevice(userId, deviceId);
  return transportForDevice(device).listSlots();
};

// readSlotSnapshot — read-only снапшот «что лежит на плате» в слоте (ownership-checked).
// Не импорт в каталог nb — беднее модели рецепта nb (нет засыпи/дрожжей/воды/эффективности).
const readSlotSnapshot: ReadSlotSnapshotFn = async ({ userId, deviceId, slot }) => {
  const device = await loadDevice(userId, deviceId);
  return transportForDevice(device).readSlotSnapshot(slot);
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
  id: BREWFORGE_PROVIDER_ID,
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
  listSlots,
  readSlotSnapshot,
  pushRecipeToDevice,
};

/**
 * Прод-демо провайдер (Phase 4.5): ТЕ ЖЕ методы, что у brewforgeProvider (ownership/
 * аудит/трансляция переиспользуются), но устройства с providerId=brewforge-demo
 * роутятся в transportForDevice → simTransport (in-process SimDevice). Отдельный
 * дескриптор нужен лишь чтобы getProvider(device.providerId) находил провайдер по
 * этому id (per-device dispatch). label помечает демо в списках провайдеров.
 */
export const brewforgeDemoProvider: BrewControllerProvider = {
  ...brewforgeProvider,
  id: BREWFORGE_DEMO_PROVIDER_ID,
  label: "BrewForge (демо)",
};
