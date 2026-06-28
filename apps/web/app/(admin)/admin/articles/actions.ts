"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";

import { requireContentRole } from "@/features/content/permissions";
import {
  createContentArticle,
  deleteContentArticle,
  setContentArticleFeatured,
  setContentArticlePublication,
  updateContentArticle,
  type ContentActor
} from "@/features/content-articles/service";
import { contentArticleInputSchema } from "@/features/content-articles/contracts";

export type ContentArticleActionResult = { ok: boolean; message: string; articleId?: string };

const firstZodMessage = (error: ZodError): string => error.issues[0]?.message ?? "Проверьте корректность данных.";

const revalidateAll = (articleId?: string, slug?: string) => {
  revalidatePath("/admin/articles");
  if (articleId) {
    revalidatePath(`/admin/articles/${articleId}/edit`);
  }
  revalidatePath("/guides");
  if (slug) {
    revalidatePath(`/guides/${slug}`);
  }
  revalidatePath("/");
};

const mapError = (error: unknown): ContentArticleActionResult => {
  // Пробрасываем редирект Next (requireContentRole → redirect для неавторизованных
  // / истёкшей сессии): его нельзя глотать как обычную ошибку.
  if (error instanceof Error) {
    const digest = (error as Error & { digest?: unknown }).digest;
    if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) {
      throw error;
    }
  }
  if (error instanceof ZodError) {
    return { ok: false, message: firstZodMessage(error) };
  }
  if (error instanceof Error && error.message === "FORBIDDEN") {
    return { ok: false, message: "Недостаточно прав для этого действия." };
  }
  if (error instanceof Error && error.message === "NOT_FOUND") {
    return { ok: false, message: "Статья не найдена." };
  }
  return { ok: false, message: "Не удалось выполнить операцию." };
};

const actorFrom = (user: { id: string; role: ContentActor["role"] }): ContentActor => ({ id: user.id, role: user.role });

export const createContentArticleAction = async (input: unknown): Promise<ContentArticleActionResult> => {
  try {
    const user = await requireContentRole("editor");
    const parsed = contentArticleInputSchema.parse(input);
    const article = await createContentArticle(actorFrom(user), parsed);
    revalidateAll(article.id, article.slug);
    return { ok: true, message: "Черновик создан.", articleId: article.id };
  } catch (error) {
    return mapError(error);
  }
};

export const updateContentArticleAction = async (articleId: string, input: unknown): Promise<ContentArticleActionResult> => {
  try {
    const user = await requireContentRole("editor");
    const parsed = contentArticleInputSchema.parse(input);
    const article = await updateContentArticle(actorFrom(user), articleId, parsed);
    revalidateAll(article.id, article.slug);
    return { ok: true, message: "Сохранено.", articleId: article.id };
  } catch (error) {
    return mapError(error);
  }
};

export const setContentArticlePublicationAction = async (articleId: string, publish: boolean): Promise<ContentArticleActionResult> => {
  try {
    const user = await requireContentRole("editor");
    const article = await setContentArticlePublication(actorFrom(user), articleId, publish);
    revalidateAll(article.id, article.slug);
    return { ok: true, message: publish ? "Статья опубликована." : "Статья снята с публикации.", articleId: article.id };
  } catch (error) {
    return mapError(error);
  }
};

export const setContentArticleFeaturedAction = async (articleId: string, featured: boolean): Promise<ContentArticleActionResult> => {
  try {
    const user = await requireContentRole("editor");
    const article = await setContentArticleFeatured(actorFrom(user), articleId, featured);
    revalidateAll(article.id, article.slug);
    return { ok: true, message: featured ? "Добавлено на главную." : "Убрано с главной.", articleId: article.id };
  } catch (error) {
    return mapError(error);
  }
};

export const deleteContentArticleAction = async (articleId: string): Promise<ContentArticleActionResult> => {
  try {
    const user = await requireContentRole("editor");
    await deleteContentArticle(actorFrom(user), articleId);
    revalidateAll(articleId);
    return { ok: true, message: "Статья удалена." };
  } catch (error) {
    return mapError(error);
  }
};
