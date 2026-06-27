import type {
  Ack,
  Command,
  DeviceConfig,
  DeviceConfigPatch,
  Telemetry,
} from "@nb/brewforge-protocol";
import type { BrewPlanSnapshot } from "../brew-batches/contracts";

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

// --- Сигнатуры методов ------------------------------------------------------

export type PushRecipeFn = (input: PushRecipeInput) => Promise<PushRecipeResult>;
export type ReadTelemetryFn = (input: ReadTelemetryInput) => Promise<Telemetry | null>;
export type SendCommandFn = (input: SendCommandInput) => Promise<Ack>;
export type OpenSessionFn = (input: SessionInput) => Promise<void>;
export type CloseSessionFn = (input: SessionInput) => Promise<void>;
export type ReadConfigFn = (input: ReadConfigInput) => Promise<DeviceConfig | null>;
export type WriteConfigFn = (input: WriteConfigInput) => Promise<DeviceConfig>;

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
}
