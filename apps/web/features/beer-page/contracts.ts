// Страница-презентация пива (/beer/<slug>) — «гостевая» витрина рецепта: тем,
// кто отсканировал QR с бутылки, показываем не рабочую страницу рецепта, а
// журнальную подачу. DTO собирает service.ts, рендерит components/beer/*.

export type BeerPresentationDto = {
  slug: string;
  title: string;
  style: {
    code: string;
    name: string;
    /** Ссылка на статью о стиле (/bjcp/<slug>), если она есть. */
    articleHref: string | null;
  } | null;
  abv: number | null;
  ibu: number | null;
  colorSrm: number | null;
  og: number | null;
  /**
   * Абзацы описания: авторский текст рецепта, а при его отсутствии — «Общее
   * впечатление» стиля из BJCP (см. descriptionSource).
   */
  descriptionParagraphs: string[];
  descriptionSource: "author" | "style" | null;
  author: {
    displayName: string | null;
    image: string | null;
  };
  /** Фото пивовара (large-вариант) — приоритетнее картинки стиля. */
  heroPhotoUrl: string | null;
  /** Стакан стиля BJCP: и блюр-фон сцены, и герой при отсутствии фото. */
  styleImageUrl: string | null;
  isPublished: boolean;
};
