import type { BrewBatchStatus } from "./contracts";

/**
 * Минимум полей свежезагруженного рецепта, нужных резолверу ниже. Без прямой
 * зависимости от типов features/recipes — резолвер остаётся чистым и
 * тестируемым без БД/моков сервис-слоя.
 */
export type BrewCompletionRatingCandidate = {
  authorId: string;
  publicationState: string;
  slug: string;
};

/**
 * Показывать ли в итоге варки блок «Оцените рецепт»: только когда варка
 * завершена, исходный рецепт всё ещё доступен (кандидат — результат свежего
 * запроса на странице; NOT_FOUND/FORBIDDEN превращаются в null ДО вызова этой
 * функции), рецепт чужой и сейчас published. Возвращает slug для формы оценки
 * или null, если блок показывать не нужно.
 */
export const resolveBrewCompletionRatingSlug = (
  status: BrewBatchStatus,
  currentUserId: string,
  candidate: BrewCompletionRatingCandidate | null
): string | null => {
  if (status !== "completed" || !candidate) {
    return null;
  }
  if (candidate.authorId === currentUserId || candidate.publicationState !== "published") {
    return null;
  }
  return candidate.slug;
};
