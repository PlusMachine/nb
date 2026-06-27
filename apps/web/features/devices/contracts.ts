import { z } from "zod";

// =============================================================================
//  features/devices — DTO/контракты управления устройствами BrewForge и пэйринга.
//  Инвариант безопасности: tokenHash НИКОГДА не покидает сервис (нет в DTO),
//  plaintext bearer-токен возвращается ровно один раз из claimDevice и нигде
//  не хранится и не логируется.
// =============================================================================

export const deviceStatusSchema = z.enum(["online", "offline", "unknown"]);
export type DeviceStatus = z.infer<typeof deviceStatusSchema>;

/** Публичный DTO устройства. Зеркалит brew_devices БЕЗ tokenHash. */
export const deviceDtoSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  providerId: z.string(),
  name: z.string(),
  hardwareId: z.string(),
  fw: z.string().nullable(),
  capabilities: z.array(z.string()),
  status: deviceStatusSchema,
  localUrl: z.string().nullable(),
  mqttPrefix: z.string().nullable(),
  lastSeenAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date()
});
export type DeviceDto = z.infer<typeof deviceDtoSchema>;

/**
 * Вход claimDevice. Два сценария:
 *  - облачный (по умолчанию): пользователь вводит одноразовый claimCode (с LCD/AP
 *    устройства) — это proof-of-possession;
 *  - LAN-bench: прямая привязка по hardwareId + localUrl без кода.
 *
 * ВАЖНО: hardwareId — это заводской идентификатор ('bf-xxxx'), он НЕ является
 * секретом/учёткой и легко угадывается. Поэтому форма допускает hardwareId без
 * кода (для совместимости/бенча), но ПОЛИТИКА в service.ts требует claimCode по
 * умолчанию: «голый» LAN-путь без кода работает лишь под флагом
 * BREWFORGE_ALLOW_UNVERIFIED_LAN_CLAIM. Схема намеренно не «ужесточается» здесь,
 * чтобы решение оставалось одним местом (service.ts) и не дублировалось.
 */
export const claimDeviceSchema = z
  .object({
    claimCode: z.string().trim().min(1).max(64).optional(),
    hardwareId: z.string().trim().min(1).max(128).optional(),
    name: z.string().trim().min(1).max(180).optional(),
    localUrl: z.string().trim().url().max(512).optional()
  })
  .refine((value) => Boolean(value.claimCode) || Boolean(value.hardwareId), {
    message: "CLAIM_CODE_OR_HARDWARE_ID_REQUIRED"
  });
export type ClaimDeviceInput = z.infer<typeof claimDeviceSchema> & { userId: string };

/** Результат пэйринга: DTO устройства + plaintext-токен (отдаётся ОДИН раз). */
export type ClaimDeviceResult = {
  device: DeviceDto;
  /** Plaintext bearer-токен. Доставить устройству; на сервере хранится только хэш. */
  token: string;
};

/** Вход createPairingCode (облачный поток выпуска одноразового кода). */
export const createPairingCodeSchema = z.object({
  userId: z.string().uuid().optional(),
  hardwareId: z.string().trim().min(1).max(128).optional()
});
export type CreatePairingCodeInput = z.infer<typeof createPairingCodeSchema>;

export type PairingCodeResult = {
  claimCode: string;
  expiresAt: Date;
};

/** Вход updateDeviceStatus (вызывает мост/бридж при коннекте/телеметрии). */
export const updateDeviceStatusSchema = z.object({
  hardwareId: z.string().trim().min(1).max(128),
  status: deviceStatusSchema,
  fw: z.string().trim().max(64).nullable().optional(),
  lastSeenAt: z.date().optional()
});
export type UpdateDeviceStatusInput = z.infer<typeof updateDeviceStatusSchema>;
