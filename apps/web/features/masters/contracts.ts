import { z } from "zod";

// Витрина мастеров (docs/masters-showcase.md): «мастер» — не роль, а наличие
// профиля мастера у пользователя. Специализации — фиксированный список-константа
// (не pgEnum), чтобы добавление значения не требовало миграции.
export const MASTER_SPECIALIZATION_DEFS = [
  { key: "vessels", label: "Ёмкости и ЦКТ" },
  { key: "automation", label: "Автоматика" },
  { key: "chillers", label: "Чиллеры" },
  { key: "mills", label: "Мельницы" },
  { key: "heating", label: "Нагрев и ТЭНы" },
  { key: "kegging", label: "Розлив и кеги" },
  { key: "other", label: "Другое" }
] as const;

export type MasterSpecializationKey = (typeof MASTER_SPECIALIZATION_DEFS)[number]["key"];

export const MASTER_SPECIALIZATIONS: ReadonlyArray<{ key: MasterSpecializationKey; label: string }> = MASTER_SPECIALIZATION_DEFS;

export const masterSpecializationKeys = MASTER_SPECIALIZATION_DEFS.map((item) => item.key) as [
  MasterSpecializationKey,
  ...MasterSpecializationKey[]
];

const masterSpecializationLabels: Record<MasterSpecializationKey, string> = Object.fromEntries(
  MASTER_SPECIALIZATION_DEFS.map((item) => [item.key, item.label])
) as Record<MasterSpecializationKey, string>;

export const getMasterSpecializationLabel = (key: string): string =>
  masterSpecializationLabels[key as MasterSpecializationKey] ?? key;

export const isMasterSpecializationKey = (key: string): key is MasterSpecializationKey =>
  Object.prototype.hasOwnProperty.call(masterSpecializationLabels, key);

// --- Статусы ревью и производные метки для кабинета/модерации ------------------

export const masterReviewStatuses = ["draft", "pending", "rejected"] as const;
export type MasterReviewStatus = (typeof masterReviewStatuses)[number];

export const masterReviewStatusLabels: Record<MasterReviewStatus, string> = {
  draft: "Черновик",
  pending: "На модерации",
  rejected: "Отклонено"
};

// Не входит в reviewStatus: производное состояние «есть одобренный снапшот»,
// нужно UI кабинета/модерации отдельным лейблом поверх статуса черновика.
export const MASTER_PUBLISHED_LABEL = "Опубликовано";

// --- Лимиты ---------------------------------------------------------------------

export const MASTER_ITEM_MAX_COUNT = 12;
export const MASTER_IMAGE_MAX_COUNT = 24;
export const MASTER_ITEM_IMAGE_MAX_COUNT = 6;
export const MASTER_IMAGE_MAX_FILE_BYTES = 10 * 1024 * 1024;

export const masterImageStatuses = ["uploading", "ready", "failed"] as const;
export type MasterImageStatus = (typeof masterImageStatuses)[number];

export const masterImageVariants = ["original", "large", "medium", "thumb"] as const;
export type MasterImageVariant = (typeof masterImageVariants)[number];

export const masterImageAcceptedMimeTypes = ["image/jpeg", "image/png", "image/webp"] as const;
export type MasterImageAcceptedMimeType = (typeof masterImageAcceptedMimeTypes)[number];

export const buildMasterImageVariantUrl = (imageId: string, variant: MasterImageVariant) =>
  `/api/master-images/${imageId}/${variant}`;

// --- Контакты: минимум один обязателен ------------------------------------------

const telegramPattern = /^(@[a-zA-Z0-9_]{5,32}|https?:\/\/(www\.)?t\.me\/[a-zA-Z0-9_]{5,32}\/?)$/;
// Разрешаем цифры/пробелы/скобки/дефисы; проверяем, что цифр наберётся хотя бы 5
// (защита от мусора вроде "+-+-+-").
const phonePattern = /^\+?[0-9()\-\s]{5,25}$/;

const optionalTrimmed = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .or(z.literal(""))
    .transform((value) => (value ? value : undefined));

const contactTelegramSchema = optionalTrimmed(200).refine(
  (value) => value === undefined || telegramPattern.test(value),
  "Укажите @ник или ссылку вида t.me/ник."
);

const contactPhoneSchema = optionalTrimmed(200).refine(
  (value) => value === undefined || (phonePattern.test(value) && value.replace(/[^0-9]/g, "").length >= 5),
  "Проверьте номер телефона."
);

const contactEmailSchema = z
  .string()
  .trim()
  .max(320)
  .email("Проверьте адрес e-mail.")
  .optional()
  .or(z.literal(""))
  .transform((value) => (value ? value : undefined));

const contactWebsiteSchema = optionalTrimmed(200).refine((value) => {
  if (value === undefined) {
    return true;
  }
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}, "Укажите ссылку вида https://example.com.");

const currentYear = new Date().getFullYear();

export const masterProfileInputSchema = z
  .object({
    displayName: z
      .string()
      .trim()
      .min(3, "Название — минимум 3 символа.")
      .max(120, "Название — максимум 120 символов."),
    city: z
      .string()
      .trim()
      .min(2, "Укажите город — минимум 2 символа.")
      .max(120, "Город — максимум 120 символов."),
    specializations: z
      .array(z.enum(masterSpecializationKeys))
      .min(1, "Выберите хотя бы одну специализацию.")
      .max(4, "Не больше 4 специализаций.")
      .refine((values) => new Set(values).size === values.length, "Специализации не должны повторяться."),
    summary: z
      .string()
      .trim()
      .min(1, "Коротко опишите, чем занимаетесь.")
      .max(200, "Summary — максимум 200 символов."),
    about: z
      .string()
      .trim()
      .min(1, "Расскажите о себе подробнее.")
      .max(5000, "Слишком длинно — до 5000 символов."),
    contactTelegram: contactTelegramSchema,
    contactPhone: contactPhoneSchema,
    contactEmail: contactEmailSchema,
    contactWebsite: contactWebsiteSchema,
    craftSince: z
      .number()
      .int()
      .min(1980, "Год — не раньше 1980.")
      .max(currentYear, "Год не может быть в будущем.")
      .nullable()
      .optional()
  })
  .refine(
    (data) => Boolean(data.contactTelegram || data.contactPhone || data.contactEmail || data.contactWebsite),
    {
      message: "Укажите хотя бы один способ связи.",
      path: ["contactTelegram"]
    }
  );

export type MasterProfileInput = z.infer<typeof masterProfileInputSchema>;

export const masterItemInputSchema = z.object({
  title: z
    .string()
    .trim()
    .min(3, "Название изделия — минимум 3 символа.")
    .max(160, "Название изделия — максимум 160 символов."),
  description: z.string().trim().max(2000, "Описание — максимум 2000 символов.").optional().default(""),
  priceNote: z
    .string()
    .trim()
    .max(80, "Заметка о цене — максимум 80 символов.")
    .optional()
    .or(z.literal(""))
    .transform((value) => (value ? value : undefined))
});

export type MasterItemInput = z.infer<typeof masterItemInputSchema>;

// --- Опубликованный снапшот (jsonb master_profiles.published_json) -------------

export type MasterPublishedSnapshotContact = {
  telegram?: string;
  phone?: string;
  email?: string;
  website?: string;
};

export type MasterPublishedSnapshotImageRef = {
  imageId: string;
  blurDataUrl: string | null;
};

export type MasterPublishedSnapshotItem = {
  id: string;
  title: string;
  description: string;
  priceNote: string | null;
  coverImageId: string | null;
  images: MasterPublishedSnapshotImageRef[];
};

export type MasterPublishedSnapshot = {
  version: 1;
  displayName: string;
  city: string;
  specializations: string[];
  summary: string;
  about: string;
  contacts: MasterPublishedSnapshotContact;
  craftSince: number | null;
  gallery: MasterPublishedSnapshotImageRef[];
  items: MasterPublishedSnapshotItem[];
  publishedAt: string;
};
