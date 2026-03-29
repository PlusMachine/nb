import { readdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const moduleDir = dirname(fileURLToPath(import.meta.url));
const BJCP_DIR = resolve(moduleDir, "../../../ingredients/bjcp");
const DEFAULT_BJCP_HERO_IMAGE_URL = "/images/bjcp-placeholder.png";

const SECTION_ORDER = [
  "overall_impression",
  "aroma",
  "appearance",
  "flavor",
  "mouthfeel",
  "comments",
  "history",
  "characteristic_ingredients",
  "style_comparison",
  "entry_instructions"
] as const;

const SECTION_LABELS: Record<string, string> = {
  overall_impression: "Общее впечатление",
  aroma: "Аромат",
  appearance: "Внешний вид",
  flavor: "Вкус",
  mouthfeel: "Ощущение во рту",
  comments: "Комментарии",
  history: "История",
  characteristic_ingredients: "Характерные ингредиенты",
  style_comparison: "Сравнение со стилями",
  entry_instructions: "Инструкции",
  commercial_examples: "Коммерческие примеры"
};

const FEATURED_STYLE_IDS = ["1A", "1C", "2A", "3A", "5B", "10A"] as const;

type RawBjcpFile = {
  source?: {
    document?: string;
    file_name?: string;
    language?: string;
    translation_scope?: string;
    notes?: string;
  };
  categories?: Array<{
    category_id?: string;
    category_en?: string;
    category_ru?: string;
    overview_ru?: string;
  }>;
  styles?: Array<{
    bjcp_id?: string;
    bjcp_heading?: string;
    category_id?: string;
    category_en?: string;
    category_ru?: string;
    name_en?: string;
    name_ru?: string;
    description_short_ru?: string;
    sections_ru?: Record<string, string | null | undefined>;
    sections_en?: Record<string, string | null | undefined>;
    vital_statistics_text?: string;
    vital_statistics?: Record<string, string | null | undefined>;
    commercial_examples_text?: string;
  }>;
};

export type BeerColorBand = "straw" | "gold" | "amber" | "copper" | "brown" | "dark";

export type ArticleSection = {
  id: string;
  label: string;
  content: string;
};

export type ArticleStat = {
  label: string;
  value: string;
};

export type ArticleSourceInfo = {
  document: string | null;
  fileName: string | null;
  language: string | null;
  translationScope: string | null;
  notes: string | null;
};

export type CategorySummary = {
  id: string;
  nameRu: string;
  nameEn: string;
  overviewRu: string | null;
  articleCount: number;
};

export type ContentArticle = {
  slug: string;
  kind: "bjcp_style";
  bjcpId: string;
  bjcpHeading: string;
  title: string;
  titleEn: string;
  description: string;
  eyebrow: string;
  category: CategorySummary;
  heroImageUrl: string | null;
  colorBand: BeerColorBand;
  publishedAt: string;
  updatedAt: string;
  readingMinutes: number;
  isFeatured: boolean;
  stats: ArticleStat[];
  sections: ArticleSection[];
  keywords: string[];
  seoTitle: string;
  seoDescription: string;
  source: ArticleSourceInfo;
};

type BjcpContentIndex = {
  articles: ContentArticle[];
  categories: CategorySummary[];
};

let cachedIndexPromise: Promise<BjcpContentIndex> | null = null;

const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

const slugify = (value: string) => value
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-+|-+$/g, "")
  .replace(/-{2,}/g, "-");

const createBjcpArticleSlug = (bjcpId: string, titleEn: string) => {
  const idSlug = slugify(bjcpId);
  const titleSlug = slugify(titleEn);

  if (!titleSlug || idSlug.endsWith(titleSlug)) {
    return `bjcp-${idSlug}`;
  }

  return `bjcp-${idSlug}-${titleSlug}`;
};

const getBjcpArticleSlugAliases = (article: Pick<ContentArticle, "bjcpId" | "titleEn" | "slug">) => {
  const aliases = new Set<string>([article.slug]);
  const titleSlug = slugify(article.titleEn);
  const rawLegacySlug = `bjcp-${article.bjcpId.toLowerCase()}-${titleSlug}`;
  aliases.add(rawLegacySlug);

  const trimmedIpaId = article.bjcpId.replace(/\s+ipa$/i, "");
  if (trimmedIpaId !== article.bjcpId) {
    aliases.add(`bjcp-${slugify(trimmedIpaId)}-${titleSlug}`);
  }

  return aliases;
};

const compareBjcpIds = (left: string, right: string) => collator.compare(left, right);

const estimateReadingMinutes = (parts: string[]) => {
  const words = parts
    .join(" ")
    .split(/\s+/)
    .filter(Boolean).length;

  return Math.max(3, Math.ceil(words / 180));
};

const parseAverageNumber = (value?: string | null) => {
  if (!value) {
    return null;
  }

  const matches = value.match(/\d+(?:\.\d+)?/g);
  if (!matches?.length) {
    return null;
  }

  const numbers = matches.map((item) => Number.parseFloat(item)).filter((item) => Number.isFinite(item));
  if (!numbers.length) {
    return null;
  }

  const total = numbers.reduce((sum, item) => sum + item, 0);
  return total / numbers.length;
};

const resolveBeerColorBand = (stats: Record<string, string | null | undefined> | undefined): BeerColorBand => {
  const averageSrm = parseAverageNumber(stats?.srm);

  if (averageSrm == null || averageSrm <= 3.5) {
    return "straw";
  }

  if (averageSrm <= 7) {
    return "gold";
  }

  if (averageSrm <= 12) {
    return "amber";
  }

  if (averageSrm <= 18) {
    return "copper";
  }

  if (averageSrm <= 28) {
    return "brown";
  }

  return "dark";
};

const buildStats = (stats?: Record<string, string | null | undefined>): ArticleStat[] => {
  const order: Array<[string, string]> = [
    ["og", "OG"],
    ["ibu", "IBU"],
    ["fg", "FG"],
    ["srm", "SRM"],
    ["abv", "ABV"]
  ];

  return order
    .map(([key, label]) => {
      const value = stats?.[key];
      return value ? { label, value } : null;
    })
    .filter((item): item is ArticleStat => item !== null);
};

const buildSections = (sections?: Record<string, string | null | undefined>): ArticleSection[] => {
  const seen = new Set<string>();
  const orderedEntries: ArticleSection[] = [];

  for (const id of SECTION_ORDER) {
    const value = sections?.[id];
    if (!value?.trim()) {
      continue;
    }

    seen.add(id);
    orderedEntries.push({
      id,
      label: SECTION_LABELS[id] ?? id,
      content: value.trim()
    });
  }

  for (const [id, value] of Object.entries(sections ?? {})) {
    if (seen.has(id) || !value?.trim()) {
      continue;
    }

    orderedEntries.push({
      id,
      label: SECTION_LABELS[id] ?? id,
      content: value.trim()
    });
  }

  return orderedEntries;
};

const appendExtraSections = (
  sections: ArticleSection[],
  extras: Array<{ id: string; content?: string | null | undefined }>
) => {
  const nextSections = [...sections];
  const seen = new Set(nextSections.map((section) => section.id));

  for (const extra of extras) {
    const content = extra.content?.trim();
    if (!content || seen.has(extra.id)) {
      continue;
    }

    nextSections.push({
      id: extra.id,
      label: SECTION_LABELS[extra.id] ?? extra.id,
      content
    });
    seen.add(extra.id);
  }

  return nextSections;
};

const buildKeywords = (style: {
  bjcpId: string;
  categoryRu: string;
  title: string;
  titleEn: string;
}) => [
  "BJCP",
  "пивные стили",
  "beer styles",
  style.bjcpId,
  style.categoryRu,
  style.title,
  style.titleEn
].filter(Boolean);

const resolvePublishedAt = (index: number) => {
  const published = new Date(Date.UTC(2026, 2, 1 + index));
  return published.toISOString();
};

const createEmptyIndex = (): BjcpContentIndex => ({ articles: [], categories: [] });

const loadBjcpFiles = async () => {
  try {
    const fileNames = (await readdir(BJCP_DIR))
      .filter((fileName) => /^bjcp_styles_.*\.json$/i.test(fileName))
      .sort();

    const files = await Promise.all(
      fileNames.map(async (fileName) => {
        const raw = await readFile(resolve(BJCP_DIR, fileName), "utf8");
        return JSON.parse(raw) as RawBjcpFile;
      })
    );

    return files;
  } catch {
    return [];
  }
};

const buildIndex = async (): Promise<BjcpContentIndex> => {
  const files = await loadBjcpFiles();
  if (!files.length) {
    return createEmptyIndex();
  }

  const categories = new Map<string, CategorySummary>();
  const articles: ContentArticle[] = [];

  for (const file of files) {
    for (const category of file.categories ?? []) {
      const id = category.category_id?.trim();
      const nameRu = category.category_ru?.trim();
      const nameEn = category.category_en?.trim();

      if (!id || !nameRu || !nameEn) {
        continue;
      }

      categories.set(id, {
        id,
        nameRu,
        nameEn,
        overviewRu: category.overview_ru?.trim() ?? null,
        articleCount: 0
      });
    }
  }

  let articleIndex = 0;

  for (const file of files) {
    const source: ArticleSourceInfo = {
      document: file.source?.document?.trim() ?? null,
      fileName: file.source?.file_name?.trim() ?? null,
      language: file.source?.language?.trim() ?? null,
      translationScope: file.source?.translation_scope?.trim() ?? null,
      notes: file.source?.notes?.trim() ?? null
    };

    for (const style of file.styles ?? []) {
      const bjcpId = style.bjcp_id?.trim();
      const title = style.name_ru?.trim();
      const titleEn = style.name_en?.trim();
      const categoryId = style.category_id?.trim();

      if (!bjcpId || !title || !titleEn || !categoryId) {
        continue;
      }

      const category = categories.get(categoryId);
      if (!category) {
        continue;
      }

      const sections = appendExtraSections(buildSections(style.sections_ru), [
        {
          id: "commercial_examples",
          content: style.commercial_examples_text
        }
      ]);
      const description = style.description_short_ru?.trim() ?? sections[0]?.content ?? `${title} по BJCP`;
      const slug = createBjcpArticleSlug(bjcpId, titleEn);
      const publishedAt = resolvePublishedAt(articleIndex);
      const stats = buildStats(style.vital_statistics);

      articles.push({
        slug,
        kind: "bjcp_style",
        bjcpId,
        bjcpHeading: style.bjcp_heading?.trim() ?? `${bjcpId}. ${titleEn}`,
        title,
        titleEn,
        description,
        eyebrow: `${bjcpId} · BJCP 2021`,
        category,
        heroImageUrl: DEFAULT_BJCP_HERO_IMAGE_URL,
        colorBand: resolveBeerColorBand(style.vital_statistics),
        publishedAt,
        updatedAt: publishedAt,
        readingMinutes: estimateReadingMinutes([
          description,
          ...sections.map((section) => section.content)
        ]),
        isFeatured: FEATURED_STYLE_IDS.includes(bjcpId as (typeof FEATURED_STYLE_IDS)[number]),
        stats,
        sections,
        keywords: buildKeywords({
          bjcpId,
          categoryRu: category.nameRu,
          title,
          titleEn
        }),
        seoTitle: `${bjcpId} · ${title} · BJCP стиль`,
        seoDescription: description,
        source
      });

      category.articleCount += 1;
      articleIndex += 1;
    }
  }

  articles.sort((left, right) => compareBjcpIds(left.bjcpId, right.bjcpId));

  const categoryList = Array.from(categories.values())
    .filter((category) => category.articleCount > 0)
    .sort((left, right) => compareBjcpIds(left.id, right.id));

  return {
    articles,
    categories: categoryList
  };
};

const getIndex = async () => {
  cachedIndexPromise ??= buildIndex();
  return cachedIndexPromise;
};

export const listArticles = async () => (await getIndex()).articles;

export const listFeaturedArticles = async () => {
  const articles = await listArticles();
  const featured = articles.filter((article) => article.isFeatured);
  return featured.length ? featured : articles.slice(0, 6);
};

export const listArticleCategories = async () => (await getIndex()).categories;

export const getArticleBySlug = async (slug: string) => {
  const articles = await listArticles();
  return articles.find((article) => getBjcpArticleSlugAliases(article).has(slug)) ?? null;
};

export const listRelatedArticles = async (article: ContentArticle, limit = 3) => {
  const articles = await listArticles();
  return articles
    .filter((candidate) => candidate.slug !== article.slug && candidate.category.id === article.category.id)
    .slice(0, limit);
};
