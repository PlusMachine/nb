import { readdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const moduleDir = dirname(fileURLToPath(import.meta.url));
const BJCP_DIR = resolve(moduleDir, "../../../ingredients/bjcp");
const BJCP_PUBLIC_IMAGES_DIR = resolve(moduleDir, "../../../apps/web/public/images/bjcp");
export const DEFAULT_BJCP_HERO_IMAGE_URL = "/images/bjcp-placeholder.png";

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

export type ArticleVitalStatistics = {
  og: string | null;
  fg: string | null;
  ibu: string | null;
  srm: string | null;
  abv: string | null;
  note: string | null;
  sessionAbv: string | null;
  standardAbv: string | null;
  doubleAbv: string | null;
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
  firstStyleId: string | null;
  lastStyleId: string | null;
  styleCodeRange: string | null;
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
  vitalStatistics: ArticleVitalStatistics;
  vitalStatisticsText: string | null;
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
const shouldCacheIndex = process.env.NODE_ENV === "production";

const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });
const vitalStatTextLabels = {
  og: "OG",
  fg: "FG",
  ibu: "IBU(?:s)?",
  srm: "SRM",
  abv: "ABV"
} as const;
const vitalStatTextLabelPattern = Object.values(vitalStatTextLabels).join("|");

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

const getBjcpCategoryCode = (bjcpId: string) => {
  const normalized = bjcpId.trim();
  if (!normalized) {
    return "";
  }

  return normalized.split(/[-\s]/u)[0] ?? normalized;
};

const buildCategoryStyleRange = (styleIds: Iterable<string>) => {
  const uniqueCodes = Array.from(new Set(
    Array.from(styleIds)
      .map(getBjcpCategoryCode)
      .filter(Boolean)
  )).sort(compareBjcpIds);

  const firstStyleId = uniqueCodes[0] ?? null;
  const lastStyleId = uniqueCodes.at(-1) ?? null;

  return {
    firstStyleId,
    lastStyleId,
    styleCodeRange: firstStyleId && lastStyleId
      ? firstStyleId === lastStyleId
        ? firstStyleId
        : `${firstStyleId}–${lastStyleId}`
      : null
  };
};

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

const resolveBeerColorBand = (stats: Pick<ArticleVitalStatistics, "srm"> | undefined): BeerColorBand => {
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

const normalizeVitalStatisticValue = (value?: string | null) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

const cleanExtractedVitalStatisticValue = (value: string) => {
  const trimmed = value
    .replace(/\s+\d+\s+BJCP Beer Style Guidelines.*$/iu, "")
    .replace(/\s*\|\s*$/u, "")
    .trim();

  return trimmed || null;
};

const extractVitalStatisticFromText = (
  value: string | null,
  key: keyof typeof vitalStatTextLabels
) => {
  if (!value) {
    return null;
  }

  const regex = new RegExp(
    `${vitalStatTextLabels[key]}:\\s*(.+?)(?=(?:\\s*\\|\\s*)?(?:${vitalStatTextLabelPattern}):|$)`,
    "iu"
  );
  const match = value.match(regex);

  return match?.[1] ? cleanExtractedVitalStatisticValue(match[1]) : null;
};

const buildVitalStatistics = (
  stats?: Record<string, string | null | undefined>,
  vitalStatisticsText?: string | null
): ArticleVitalStatistics => {
  const trimmedText = vitalStatisticsText?.trim() ?? null;
  const normalized = {
    og: normalizeVitalStatisticValue(stats?.og),
    fg: normalizeVitalStatisticValue(stats?.fg),
    ibu: normalizeVitalStatisticValue(stats?.ibu),
    srm: normalizeVitalStatisticValue(stats?.srm),
    abv: normalizeVitalStatisticValue(stats?.abv),
    note: normalizeVitalStatisticValue(stats?.note),
    sessionAbv: normalizeVitalStatisticValue(stats?.session_abv),
    standardAbv: normalizeVitalStatisticValue(stats?.standard_abv),
    doubleAbv: normalizeVitalStatisticValue(stats?.double_abv)
  } satisfies ArticleVitalStatistics;
  const hasSubtypeAbv = Boolean(normalized.sessionAbv || normalized.standardAbv || normalized.doubleAbv);

  if (!normalized.og) {
    normalized.og = extractVitalStatisticFromText(trimmedText, "og");
  }

  if (!normalized.fg) {
    normalized.fg = extractVitalStatisticFromText(trimmedText, "fg");
  }

  if (!normalized.ibu) {
    normalized.ibu = extractVitalStatisticFromText(trimmedText, "ibu");
  }

  if (!normalized.srm) {
    normalized.srm = extractVitalStatisticFromText(trimmedText, "srm");
  }

  if (!normalized.abv && !hasSubtypeAbv) {
    normalized.abv = extractVitalStatisticFromText(trimmedText, "abv");
  }

  if (
    !normalized.note
    && !normalized.og
    && !normalized.fg
    && !normalized.ibu
    && !normalized.srm
    && !normalized.abv
    && trimmedText
  ) {
    normalized.note = trimmedText;
  }

  return normalized;
};

const buildStats = (stats: ArticleVitalStatistics): ArticleStat[] => {
  const order: Array<[keyof Pick<ArticleVitalStatistics, "og" | "fg" | "ibu" | "srm" | "abv">, string]> = [
    ["og", "НП"],
    ["fg", "КП"],
    ["ibu", "IBU"],
    ["srm", "SRM"],
    ["abv", "ABV"]
  ];

  return order
    .map(([key, label]) => {
      const value = stats[key];
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

const extractStyleIdFromImageFileName = (fileName: string) => {
  const normalizedFileName = fileName.normalize("NFC");
  const basename = normalizedFileName.replace(/\.[^.]+$/u, "");
  const match = basename.match(/^(.+?)\s+—\s+/u);

  return (match?.[1] ?? basename).trim();
};

const loadHeroImageUrls = async () => {
  try {
    const fileNames = await readdir(BJCP_PUBLIC_IMAGES_DIR);
    const heroImageUrls = new Map<string, string>();

    for (const fileName of fileNames) {
      if (!/\.(png|jpe?g|webp|avif)$/iu.test(fileName)) {
        continue;
      }

      const styleId = extractStyleIdFromImageFileName(fileName);
      if (!styleId) {
        continue;
      }

      heroImageUrls.set(styleId, `/images/bjcp/${encodeURIComponent(fileName)}`);
    }

    return heroImageUrls;
  } catch {
    return new Map<string, string>();
  }
};

const buildIndex = async (): Promise<BjcpContentIndex> => {
  const files = await loadBjcpFiles();
  if (!files.length) {
    return createEmptyIndex();
  }

  const heroImageUrls = await loadHeroImageUrls();

  const categories = new Map<string, CategorySummary>();
  const categoryStyleIds = new Map<string, Set<string>>();
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
        articleCount: 0,
        firstStyleId: null,
        lastStyleId: null,
        styleCodeRange: null
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
      const vitalStatisticsText = style.vital_statistics_text?.trim() ?? null;
      const vitalStatistics = buildVitalStatistics(style.vital_statistics, vitalStatisticsText);
      const stats = buildStats(vitalStatistics);

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
        heroImageUrl: heroImageUrls.get(bjcpId) ?? DEFAULT_BJCP_HERO_IMAGE_URL,
        colorBand: resolveBeerColorBand(vitalStatistics),
        publishedAt,
        updatedAt: publishedAt,
        readingMinutes: estimateReadingMinutes([
          description,
          ...sections.map((section) => section.content)
        ]),
        isFeatured: FEATURED_STYLE_IDS.includes(bjcpId as (typeof FEATURED_STYLE_IDS)[number]),
        stats,
        vitalStatistics,
        vitalStatisticsText,
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
      const styleIds = categoryStyleIds.get(category.id) ?? new Set<string>();
      styleIds.add(bjcpId);
      categoryStyleIds.set(category.id, styleIds);
      articleIndex += 1;
    }
  }

  articles.sort((left, right) => compareBjcpIds(left.bjcpId, right.bjcpId));

  for (const category of categories.values()) {
    const range = buildCategoryStyleRange(categoryStyleIds.get(category.id) ?? []);
    category.firstStyleId = range.firstStyleId;
    category.lastStyleId = range.lastStyleId;
    category.styleCodeRange = range.styleCodeRange;
  }

  const categoryList = Array.from(categories.values())
    .filter((category) => category.articleCount > 0)
    .sort((left, right) => compareBjcpIds(left.id, right.id));

  return {
    articles,
    categories: categoryList
  };
};

const getIndex = async () => {
  if (!shouldCacheIndex) {
    return buildIndex();
  }

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
