import { z } from "zod";

// =============================================================================
//  features/firmware — контракты реестра релизов прошивки BrewForge
//  (F2, docs/brewforge-firmware-releases.md §3–5).
// =============================================================================

export const firmwareChannelSchema = z.enum(["stable", "beta"]);
export type FirmwareChannel = z.infer<typeof firmwareChannelSchema>;

/** Публичный DTO релиза (зеркалит firmware_releases; путей ФС наружу не отдаём). */
export type FirmwareReleaseDto = {
  id: string;
  providerId: string;
  version: string;
  channel: FirmwareChannel;
  protocolSchema: number;
  notes: string;
  fileName: string;
  fileSize: number;
  fileSha256: string;
  publishedAt: Date | null;
  yankedAt: Date | null;
  createdAt: Date;
};

/** Вход publishRelease (CLI firmware:publish). filePath — путь к .bin на диске. */
export const publishReleaseSchema = z.object({
  filePath: z.string().min(1),
  version: z.string().min(1),
  notes: z.string().min(1),
  channel: firmwareChannelSchema.default("stable"),
  protocolSchema: z.number().int().positive().default(1),
  providerId: z.string().min(1).default("brewforge"),
});
export type PublishReleaseInput = z.input<typeof publishReleaseSchema>;

/** Ответ манифеста GET /api/firmware/manifest?current=<ver> (спека §5.2). */
export type FirmwareManifest =
  | { schema: number; updateAvailable: false }
  | {
      schema: number;
      updateAvailable: true;
      latest: {
        version: string;
        url: string;
        sha256: string;
        size: number;
        protocolSchema: number;
        notes: string;
      };
    };

// Клиентская часть админ-раздела «Прошивки». Живёт здесь, а не в admin.ts:
// тот тянет @nb/db, и импорт из клиентского компонента утащил бы pg в бандл.

export const FIRMWARE_UPLOAD_MAX_BYTES = 8 * 1024 * 1024;

export const FIRMWARE_UPLOAD_ACCEPT = ".bin";

export type FirmwareReleaseStatus = "latest" | "published" | "yanked" | "draft";

export const firmwareReleaseStatusLabels: Record<FirmwareReleaseStatus, string> = {
  latest: "Актуальный",
  published: "Опубликован",
  yanked: "Отозван",
  draft: "Черновик"
};

export type AdminFirmwareRelease = FirmwareReleaseDto & {
  status: FirmwareReleaseStatus;
  statusLabel: string;
  /** Кто опубликовал (из журнала); null — публикация из CLI или до появления журнала. */
  publishedByName: string | null;
};

/** «2.04 МБ» — размер образа в списке релизов. */
export const formatFirmwareSize = (bytes: number): string => {
  if (bytes < 1024) {
    return `${bytes} Б`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} КБ`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(2)} МБ`;
};
