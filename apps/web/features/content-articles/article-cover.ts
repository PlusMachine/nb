import { pickTextColorForSrm, srmToSoftGradient } from "@/features/recipes/beer-color";

// Генеративная обложка для статей без coverImageUrl (F13 UX-аудита): вместо
// плоского градиента-заглушки — детерминированная псевдо-SRM заливка по slug,
// та же палитра/градиент, что и у карточек рецептов без фото.

const MIN_SRM = 3;
const MAX_SRM = 35;

/** Простой детерминированный хэш строки (djb2-подобный, без внешних зависимостей). */
function hashSlug(slug: string): number {
  let hash = 5381;
  for (let i = 0; i < slug.length; i += 1) {
    hash = ((hash << 5) + hash + slug.charCodeAt(i)) >>> 0;
  }
  return hash;
}

/** Псевдо-SRM статьи по slug: стабильный на диапазон {@link MIN_SRM}..{@link MAX_SRM}. */
export function articleCoverSrm(slug: string): number {
  const hash = hashSlug(slug);
  return MIN_SRM + (hash % (MAX_SRM - MIN_SRM + 1));
}

export type ArticleCover = {
  /** Готовая CSS-заливка обложки (мягкий SRM-градиент). */
  background: string;
  /** Цвет текста/акцента поверх заливки, читаемый на этом фоне. */
  textColor: string;
};

/** Обложка-заглушка статьи: заливка + читаемый цвет акцента, детерминированные по slug. */
export function articleCoverFromSlug(slug: string): ArticleCover {
  const srm = articleCoverSrm(slug);
  return {
    background: srmToSoftGradient(srm),
    textColor: pickTextColorForSrm(srm)
  };
}
