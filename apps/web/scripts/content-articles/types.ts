import type { ContentArticleType, TiptapDoc } from "../../features/content-articles/contracts";

// Редакционная статья, живущая в репозитории. Публикуется в БД скриптом
// scripts/seed-content-articles.ts (npm run seed:articles). Слаг фиксированный —
// он же URL /articles/<slug> и ключ related-links.
export type EditorialArticle = {
  slug: string;
  type: ContentArticleType;
  title: string;
  excerpt: string;
  seoTitle?: string;
  seoDescription?: string;
  coverImageUrl?: string;
  featured: boolean;
  body: TiptapDoc;
};
