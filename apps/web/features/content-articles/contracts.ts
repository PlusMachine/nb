import { z } from "zod";

// Контент-CMS (Track A): редакторские статьи/гайды/обзоры из БД (content_articles).
// BJCP остаётся file-backed (@nb/content) и здесь не участвует.

export const contentArticleTypes = ["guide", "review"] as const;
export type ContentArticleType = (typeof contentArticleTypes)[number];

export const contentArticleStatuses = ["draft", "published", "archived"] as const;
export type ContentArticleStatus = (typeof contentArticleStatuses)[number];

export const contentArticleTypeLabels: Record<ContentArticleType, string> = {
  guide: "Гайд",
  review: "Обзор"
};

export const contentArticleStatusLabels: Record<ContentArticleStatus, string> = {
  draft: "Черновик",
  published: "Опубликовано",
  archived: "В архиве"
};

export const contentArticleStatusBadgeClass: Record<ContentArticleStatus, string> = {
  draft: "bg-amber-100 text-amber-800",
  published: "bg-emerald-100 text-emerald-700",
  archived: "bg-zinc-100 text-zinc-500"
};

// Tiptap ProseMirror-документ (узлы StarterKit + link). Хранится как есть в bodyJson.
export type TiptapNode = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TiptapNode[];
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
  text?: string;
};
export type TiptapDoc = { type: "doc"; content?: TiptapNode[] };

export type ContentArticleDto = {
  id: string;
  type: ContentArticleType;
  status: ContentArticleStatus;
  slug: string;
  title: string;
  excerpt: string | null;
  bodyJson: TiptapDoc | null;
  metaJson: Record<string, unknown>;
  coverImageUrl: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  readingMinutes: number;
  isFeatured: boolean;
  authorId: string | null;
  authorName: string | null;
  reviewerId: string | null;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

// Слим-проекция для списков (админка/хаб/главная) — без тяжёлого bodyJson.
export type ContentArticleListItem = {
  id: string;
  type: ContentArticleType;
  status: ContentArticleStatus;
  slug: string;
  title: string;
  excerpt: string | null;
  coverImageUrl: string | null;
  readingMinutes: number;
  isFeatured: boolean;
  authorName: string | null;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

// Допускаем относительные пути и абсолютные http(s) URL обложки (Phase 4 заменит
// на полноценный upload). Пустая строка → null.
const coverImageUrlField = z
  .string()
  .trim()
  .max(2048)
  .refine((value) => value === "" || value.startsWith("/") || /^https?:\/\//i.test(value), "Укажите http(s)-URL или путь от корня (/...).")
  .transform((value) => (value === "" ? null : value))
  .nullable()
  .optional();

// Tiptap-документ: верхний узел doc. Хранилище нестрогое (узлы валидируются
// рендерером), но базовую форму проверяем.
const tiptapDocSchema = z
  .object({ type: z.literal("doc"), content: z.array(z.any()).optional() })
  .passthrough()
  .nullable()
  .optional();

export const contentArticleInputSchema = z.object({
  title: z.string().trim().min(1, "Введите заголовок.").max(180, "Заголовок не длиннее 180 символов."),
  type: z.enum(contentArticleTypes).default("guide"),
  excerpt: z.string().trim().max(500, "Аннотация не длиннее 500 символов.").nullable().optional(),
  bodyJson: tiptapDocSchema,
  metaJson: z.record(z.string(), z.unknown()).optional(),
  coverImageUrl: coverImageUrlField,
  seoTitle: z.string().trim().max(255, "SEO-заголовок не длиннее 255 символов.").nullable().optional(),
  seoDescription: z.string().trim().max(500, "SEO-описание не длиннее 500 символов.").nullable().optional()
});

export type ContentArticleInput = z.infer<typeof contentArticleInputSchema>;

// Фильтры списка в админке.
export const adminContentArticleFilterSchema = z.object({
  type: z.enum(contentArticleTypes).optional(),
  status: z.enum(contentArticleStatuses).optional()
});
export type AdminContentArticleFilter = z.infer<typeof adminContentArticleFilterSchema>;
