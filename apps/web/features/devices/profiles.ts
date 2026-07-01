import { and, db, deviceProfiles, desc, eq } from "@nb/db";
import {
  DeviceConfigPatchSchema,
  type DeviceConfig,
  type DeviceConfigPatch,
} from "@nb/brewforge-protocol";

import { getProviderForDevice } from "@/features/brew-controller";

import { getDeviceById } from "./service";

// =============================================================================
//  features/devices — бэкап/восстановление настраиваемого конфига §6.3 устройства
//  (Phase 4.3 «облачное резервирование настроек»). Профиль — это снимок
//  DeviceConfig (несекретный), который пользователь может сохранить и позже
//  применить к устройству. БЕЗОПАСНЫЙ КЛАМПИНГ полей и интерлоки §5 всё равно
//  выполняет САМО устройство при применении (writeConfig → PUT /config); портал
//  лишь валидирует ФОРМУ. Все операции ownership-checked по userId.
// =============================================================================

const NAME_MAX = 180;

export type DeviceProfileDto = {
  id: string;
  userId: string;
  /** NULL = пресет «вообще» (не привязан к конкретному прибору). */
  deviceId: string | null;
  name: string;
  config: DeviceConfigPatch;
  createdAt: Date;
  updatedAt: Date;
};

type DeviceProfileRow = typeof deviceProfiles.$inferSelect;

const mapProfileDto = (row: DeviceProfileRow): DeviceProfileDto => ({
  id: row.id,
  userId: row.userId,
  deviceId: row.deviceId,
  name: row.name,
  config: (row.config ?? {}) as DeviceConfigPatch,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt
});

export type SaveDeviceProfileInput = {
  userId: string;
  /** Опциональная привязка к устройству; если задана — проверяется владение. */
  deviceId?: string | null;
  name: string;
  config: DeviceConfigPatch;
};

/** Сохранить снимок конфига как профиль (бэкап/пресет). */
export const saveDeviceProfile = async (input: SaveDeviceProfileInput): Promise<DeviceProfileDto> => {
  const name = input.name.trim().slice(0, NAME_MAX);
  if (!name) {
    throw new Error("PROFILE_NAME_REQUIRED");
  }

  const parsed = DeviceConfigPatchSchema.safeParse(input.config);
  if (!parsed.success) {
    throw new Error("INVALID_CONFIG");
  }

  // Привязка к устройству опциональна; если задана — оно должно принадлежать юзеру.
  let deviceId: string | null = input.deviceId ?? null;
  if (deviceId) {
    const device = await getDeviceById(input.userId, deviceId);
    if (!device) {
      throw new Error("NOT_FOUND");
    }
    deviceId = device.id;
  }

  const [row] = await db
    .insert(deviceProfiles)
    .values({
      userId: input.userId,
      deviceId,
      name,
      config: parsed.data as Record<string, unknown>
    })
    .returning();
  if (!row) {
    throw new Error("PROFILE_SAVE_FAILED");
  }
  return mapProfileDto(row);
};

/** Все профили пользователя (свежие сверху). */
export const listDeviceProfiles = async (userId: string): Promise<DeviceProfileDto[]> => {
  const rows = await db.query.deviceProfiles.findMany({
    where: eq(deviceProfiles.userId, userId),
    orderBy: [desc(deviceProfiles.updatedAt)]
  });
  return rows.map(mapProfileDto);
};

export type ApplyDeviceProfileInput = {
  userId: string;
  profileId: string;
  /** Целевое устройство (можно восстановить профиль на другой прибор). */
  deviceId: string;
};

/**
 * Применить сохранённый профиль к устройству: грузим снимок конфига и пишем его
 * через провайдера (PUT /config). Устройство КЛАМПИТ каждое поле в безопасный
 * диапазон и применяет после перезагрузки; возвращаем эффективный (клампнутый)
 * конфиг. Ownership проверяется и на профиле, и на устройстве.
 */
export const applyDeviceProfile = async (input: ApplyDeviceProfileInput): Promise<DeviceConfig> => {
  const { userId, profileId, deviceId } = input;

  const [profile] = await db
    .select()
    .from(deviceProfiles)
    .where(and(eq(deviceProfiles.id, profileId), eq(deviceProfiles.userId, userId)))
    .limit(1);
  if (!profile) {
    throw new Error("NOT_FOUND");
  }

  // Целевое устройство должно принадлежать пользователю (ранняя дружелюбная ошибка;
  // writeConfig дополнительно сверит владение перед обращением к транспорту).
  const device = await getDeviceById(userId, deviceId);
  if (!device) {
    throw new Error("NOT_FOUND");
  }

  const config = DeviceConfigPatchSchema.parse(profile.config);

  const provider = getProviderForDevice(device);
  if (!provider?.writeConfig) {
    throw new Error("PROVIDER_UNAVAILABLE");
  }
  return provider.writeConfig({ userId, deviceId: device.id, config });
};
