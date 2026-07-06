import type {
  Ack,
  Command,
  DeviceConfig,
  DeviceConfigPatch,
  DeviceLogFileMeta,
  DeviceRecipe,
  Telemetry,
} from "@nb/brewforge-protocol";
import type { DeviceRecipeSlot } from "./transport";
import type { BrewPlanSnapshot } from "../brew-batches/contracts";

/** id встроенного провайдера BrewForge (LAN/облако — реальное железо/симулятор). */
export const BREWFORGE_PROVIDER_ID = "brewforge";
/**
 * id прод-демо провайдера: то же поведение, но транспорт — in-process SimDevice
 * (Phase 4.5, «попробуй до покупки» БЕЗ железа и без loopback-сети). Устройства с
 * этим providerId роутятся в simTransport (см. transportForDevice).
 */
export const BREWFORGE_DEMO_PROVIDER_ID = "brewforge-demo";

export type BrewControllerCapability =
  | "telemetry"
  | "manual_control"
  | "profile_push"
  | "recipe_push"
  | "live_session_control"
  | "fermentation_logging"
  | "brew_logging";

export type BrewControllerProviderDescriptor = {
  id: string;
  label: string;
  capabilities: BrewControllerCapability[];
  enabled: boolean;
};

// --- Входы/выходы методов провайдера ---------------------------------------

/** Пуш рецепта в провайдер. Полезная нагрузка — замороженный снимок плана варки. */
export type PushRecipeInput = {
  userId: string;
  brewBatchId: string;
  brewPlanSnapshot: BrewPlanSnapshot;
};
export type PushRecipeResult = { externalId?: string | null };

export type ReadTelemetryInput = { userId: string; deviceId: string };

export type SendCommandInput = {
  userId: string;
  deviceId: string;
  brewBatchId?: string;
  command: Command;
};

export type SessionInput = {
  userId: string;
  deviceId: string;
  brewBatchId: string;
};

/** Прочитать НЕсекретный конфиг §6.3 устройства. */
export type ReadConfigInput = { userId: string; deviceId: string };

/** Записать (под)множество полей конфига §6.3 (устройство клампит и персистит). */
export type WriteConfigInput = {
  userId: string;
  deviceId: string;
  config: DeviceConfigPatch;
};

export type ListSlotsInput = { userId: string; deviceId: string };

/**
 * Device-first push рецепта nb НА плату (Phase 4), БЕЗ создания партии варки.
 * Полезная нагрузка — тот же замороженный снимок плана; провайдер транслирует его
 * в нативный DeviceRecipe и пишет в целевой слот. `slot` опционален (без него —
 * слот по умолчанию/выбор устройства). Возвращает номер слота, куда рецепт лёг.
 */
export type PushRecipeToDeviceInput = {
  userId: string;
  deviceId: string;
  brewPlanSnapshot: BrewPlanSnapshot;
  slot?: number;
};
export type PushRecipeToDeviceResult = { slot: number };

/** Прочитать read-only снапшот «что лежит на плате» в слоте N. */
export type ReadSlotSnapshotInput = { userId: string; deviceId: string; slot: number };

/** P3 (офлайн-журнал): список файлов на устройстве (GET /log, LAN-only). */
export type ListLogsInput = { userId: string; deviceId: string };

/** P3: скачать конкретный файл журнала (.jsonl) целиком (GET /log?name=, LAN-only). */
export type ReadLogInput = { userId: string; deviceId: string; name: string };

/** F3 (OTA): запустить обновление прошивки с url (LAN POST /ota / облако {"cmd":"ota"}). */
export type StartOtaInput = { userId: string; deviceId: string; url: string };

// --- Сигнатуры методов ------------------------------------------------------

export type PushRecipeFn = (input: PushRecipeInput) => Promise<PushRecipeResult>;
export type ReadTelemetryFn = (input: ReadTelemetryInput) => Promise<Telemetry | null>;
export type SendCommandFn = (input: SendCommandInput) => Promise<Ack>;
export type OpenSessionFn = (input: SessionInput) => Promise<void>;
export type CloseSessionFn = (input: SessionInput) => Promise<void>;
export type ReadConfigFn = (input: ReadConfigInput) => Promise<DeviceConfig | null>;
export type WriteConfigFn = (input: WriteConfigInput) => Promise<DeviceConfig>;
export type ListSlotsFn = (input: ListSlotsInput) => Promise<DeviceRecipeSlot[]>;
export type ReadSlotSnapshotFn = (input: ReadSlotSnapshotInput) => Promise<DeviceRecipe | null>;
export type PushRecipeToDeviceFn = (
  input: PushRecipeToDeviceInput
) => Promise<PushRecipeToDeviceResult>;
export type ListLogsFn = (input: ListLogsInput) => Promise<DeviceLogFileMeta[]>;
/** null — файла нет на устройстве (404) ИЛИ он был вытеснен ретеншном между list/read. */
export type ReadLogFn = (input: ReadLogInput) => Promise<string | null>;
/** F3: fire-and-forget — гейты (IDLE-only, подпись) на устройстве, прогресс в .../log. */
export type StartOtaFn = (input: StartOtaInput) => Promise<void>;

/**
 * Базовый провайдер контроллера. Все методы ОПЦИОНАЛЬНЫ: фактическую поддержку
 * рантайм анонсирует через `capabilities`, а реестр хранит провайдеры именно в
 * этом виде. Конкретные реализации (например `BrewforgeProvider`) присваиваемы
 * к этому типу, т.к. требуемые методы у́же опциональных.
 */
export type BrewControllerProvider = BrewControllerProviderDescriptor & {
  pushRecipe?: PushRecipeFn;
  readTelemetry?: ReadTelemetryFn;
  sendCommand?: SendCommandFn;
  openSession?: OpenSessionFn;
  closeSession?: CloseSessionFn;
  readConfig?: ReadConfigFn;
  writeConfig?: WriteConfigFn;
  listSlots?: ListSlotsFn;
  readSlotSnapshot?: ReadSlotSnapshotFn;
  pushRecipeToDevice?: PushRecipeToDeviceFn;
  /** P3, LAN-only (офлайн-журнал варки, bf_log.c) — облачный/демо-транспорт его не отдаёт. */
  listLogs?: ListLogsFn;
  readLog?: ReadLogFn;
  /** F3 (OTA) — демо-транспорт не поддерживает. */
  startOta?: StartOtaFn;
};

/**
 * Полноценный контроллер (BrewForge): реализует весь контракт — пуш рецепта,
 * чтение телеметрии (тип `Telemetry` из @nb/brewforge-protocol), отправку команд
 * (`Command`→`Ack`) и хуки жизненного цикла сессии.
 */
export interface BrewforgeProvider extends BrewControllerProviderDescriptor {
  pushRecipe: PushRecipeFn;
  readTelemetry: ReadTelemetryFn;
  sendCommand: SendCommandFn;
  openSession: OpenSessionFn;
  closeSession: CloseSessionFn;
  readConfig: ReadConfigFn;
  writeConfig: WriteConfigFn;
  listSlots: ListSlotsFn;
  readSlotSnapshot: ReadSlotSnapshotFn;
  pushRecipeToDevice: PushRecipeToDeviceFn;
  /** P3: LAN-only (облачный/демо-транспорт не поддерживает — см. transport.ts DeviceTransport). */
  listLogs?: ListLogsFn;
  readLog?: ReadLogFn;
  /** F3 (OTA): LAN POST /ota либо облачная {"cmd":"ota"} — демо не поддерживает. */
  startOta?: StartOtaFn;
}
