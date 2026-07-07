import { z } from "zod";

export const feedbackKinds = ["inaccuracy", "improvement", "bug", "question"] as const;
export type FeedbackKind = (typeof feedbackKinds)[number];

export const feedbackKindLabels: Record<FeedbackKind, string> = {
  inaccuracy: "Неточность",
  improvement: "Предложение",
  bug: "Ошибка",
  question: "Вопрос"
};

export const feedbackStatuses = ["new", "in_progress", "resolved", "dismissed"] as const;
export type FeedbackStatus = (typeof feedbackStatuses)[number];

export const feedbackStatusLabels: Record<FeedbackStatus, string> = {
  new: "Новое",
  in_progress: "В работе",
  resolved: "Решено",
  dismissed: "Отклонено"
};

// Контекст страницы прикрепляется автоматически виджетом (или контекстной ссылкой).
export const feedbackContextSchema = z
  .object({
    pageUrl: z.string().max(2048).optional(),
    pagePath: z.string().max(512).optional(),
    zone: z.string().max(32).optional(),
    entityType: z.string().max(64).optional(),
    entityId: z.string().max(128).optional(),
    entityLabel: z.string().max(200).optional(),
    referrer: z.string().max(2048).optional(),
    viewport: z.string().max(32).optional()
  })
  .partial();
export type FeedbackContext = z.infer<typeof feedbackContextSchema>;

export const feedbackInputSchema = z.object({
  kind: z.enum(feedbackKinds),
  message: z
    .string()
    .trim()
    .min(5, "Опишите чуть подробнее — минимум 5 символов.")
    .max(2000, "Слишком длинно — до 2000 символов."),
  contactEmail: z
    .string()
    .trim()
    .max(320)
    .email("Проверьте адрес e-mail.")
    .optional()
    .or(z.literal(""))
    .transform((value) => (value ? value : undefined)),
  context: feedbackContextSchema.optional()
});
export type FeedbackInput = z.infer<typeof feedbackInputSchema>;

export type FeedbackDto = {
  id: string;
  kind: FeedbackKind;
  message: string;
  contactEmail: string | null;
  pageUrl: string | null;
  pagePath: string | null;
  context: Record<string, unknown>;
  status: FeedbackStatus;
  submittedByUserId: string | null;
  submitterName: string | null;
  moderatorId: string | null;
  resolutionNote: string | null;
  createdAt: Date;
  updatedAt: Date;
};
