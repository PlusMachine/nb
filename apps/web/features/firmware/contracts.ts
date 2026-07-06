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
