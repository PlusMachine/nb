"use server";

// =============================================================================
//  features/devices/actions.ts
//  Серверные экшены бэкапа/восстановления настраиваемого конфига §6.3 устройства
//  (профили). Тонкая обёртка над features/devices/profiles.ts: берёт userId из
//  сессии (requireUser) — клиент НЕ передаёт его, чтобы нельзя было подменить —
//  и сериализует DTO в клиент-дружественную форму (даты → ISO-строки).
//
//  Безопасность: безопасный клампинг полей и интерлоки §5 остаются на УСТРОЙСТВЕ
//  (applyDeviceProfile → writeConfig → PUT /config). tokenHash/секреты сюда не
//  попадают (профиль — это только несекретный DeviceConfig).
// =============================================================================
import type { DeviceConfig, DeviceConfigPatch } from "@nb/brewforge-protocol";

import { requireUser } from "@/lib/auth";

import {
  applyDeviceProfile,
  listDeviceProfiles,
  saveDeviceProfile,
  type DeviceProfileDto
} from "./profiles";

/** Сериализованный профиль для клиента (даты — ISO-строки). */
export type DeviceProfileView = {
  id: string;
  deviceId: string | null;
  name: string;
  config: DeviceConfigPatch;
  createdAt: string;
  updatedAt: string;
};

const toView = (dto: DeviceProfileDto): DeviceProfileView => ({
  id: dto.id,
  deviceId: dto.deviceId,
  name: dto.name,
  config: dto.config,
  createdAt: dto.createdAt.toISOString(),
  updatedAt: dto.updatedAt.toISOString()
});

/** Список профилей текущего пользователя (свежие сверху). */
export async function listProfilesAction(): Promise<DeviceProfileView[]> {
  const user = await requireUser();
  const rows = await listDeviceProfiles(user.id);
  return rows.map(toView);
}

/** Сохранить текущий конфиг как именованный профиль (бэкап/пресет). */
export async function saveProfileAction(input: {
  deviceId?: string | null;
  name: string;
  config: DeviceConfigPatch;
}): Promise<DeviceProfileView> {
  const user = await requireUser();
  const dto = await saveDeviceProfile({
    userId: user.id,
    deviceId: input.deviceId ?? null,
    name: input.name,
    config: input.config
  });
  return toView(dto);
}

/**
 * Применить сохранённый профиль к устройству. Возвращает ЭФФЕКТИВНЫЙ (клампнутый
 * прошивкой) конфиг — устройство применяет его после перезагрузки.
 */
export async function applyProfileAction(input: {
  profileId: string;
  deviceId: string;
}): Promise<DeviceConfig> {
  const user = await requireUser();
  return applyDeviceProfile({
    userId: user.id,
    profileId: input.profileId,
    deviceId: input.deviceId
  });
}
