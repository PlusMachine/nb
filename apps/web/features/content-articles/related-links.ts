export type RelatedLink = { href: string; label: string };

// Куратируемая вручную карта slug статьи → ссылки «Дальше». Контент-модель
// статей пока не хранит related-связи (это добавит CMS позже) — до тех пор
// подбираем вручную здесь, по мере появления новых гайдов.
const relatedLinksBySlug: Record<string, RelatedLink[]> = {
  "kak-svarit-pervoe-pivo": [
    { href: "/calculators/priming-sugar", label: "Карбонизация сахаром" },
    { href: "/calculators/abv-attenuation", label: "Крепость и сбраживание" },
    { href: "/recipes", label: "Рецепты сообщества" }
  ],
  "pervaya-varka-doma-poshagovyy-chek-list": [
    { href: "/recipes", label: "Рецепты сообщества" },
    { href: "/calculators/brewing-water-volume", label: "Вода на варку" },
    { href: "/calculators/abv-attenuation", label: "Крепость и сбраживание" }
  ],
  "kontrol-temperatury-brozheniya": [
    { href: "/bjcp", label: "Стили пива" },
    { href: "/calculators/yeast-starter", label: "Засев дрожжей" },
    { href: "/recipes", label: "Рецепты сообщества" }
  ]
};

// Для гайдов без записи в карте — общий вход в остальной знаниевый контур.
const defaultRelatedLinks: RelatedLink[] = [
  { href: "/recipes", label: "Рецепты сообщества" },
  { href: "/calculators", label: "Калькуляторы" },
  { href: "/bjcp", label: "Стили пива" }
];

export const getRelatedLinksForArticle = (slug: string): RelatedLink[] => (
  relatedLinksBySlug[slug] ?? defaultRelatedLinks
);
