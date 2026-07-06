/**
 * Публикация редакционных статей из репозитория (scripts/content-articles/*)
 * в таблицу content_articles.
 *
 * Поведение:
 *  - статьи с новым слагом создаются сразу опубликованными;
 *  - существующие по умолчанию НЕ трогаются (правки из админки не затираются);
 *  - `--force` перезаписывает контентные поля из репозитория; курационные и
 *    служебные поля (слаг, статус, дата публикации, автор, isFeatured)
 *    сохраняются как есть.
 *
 * Запуск:  npm run seed:articles                     (автор — DEV_AUTH_EMAIL или дефолт)
 *          npm run seed:articles -- --email you@example.com
 *          npm run seed:articles -- --force
 *
 * В production скрипт заблокирован — туда контент едет через админку (/admin/articles).
 */
import { contentArticles, db, eq, users } from "@nb/db";
import { parseServerEnv } from "@nb/shared";

import { estimateReadingMinutes } from "../features/content-articles/reading-time";
import { EDITORIAL_ARTICLES, type EditorialArticle } from "./content-articles";

const DEFAULT_EMAIL = "artyom.movchan@gmail.com";

// Хост БД, а не подстрока всего URL: схема postgres:// матчила бы любую базу.
const LOCAL_DB_HOSTS = new Set(["localhost", "127.0.0.1", "postgres"]);

const assertDevOnly = () => {
  const env = parseServerEnv(process.env);
  if (env.NODE_ENV === "production") {
    throw new Error("seed:articles заблокирован в production — публикуйте через /admin/articles.");
  }
  let host = "";
  try {
    host = new URL(env.DATABASE_URL).hostname;
  } catch {
    // оставляем host пустым — упадём ниже
  }
  if (!LOCAL_DB_HOSTS.has(host)) {
    throw new Error(`seed:articles допускает только локальную БД (localhost/127.0.0.1/postgres), а не "${host}".`);
  }
};

const parseArgs = (argv: string[]): { email: string; force: boolean } => {
  const index = argv.indexOf("--email");
  let email = (process.env.DEV_AUTH_EMAIL?.trim() || DEFAULT_EMAIL).toLowerCase();
  if (index !== -1) {
    const value = argv[index + 1]?.trim();
    if (!value || value.startsWith("--")) {
      throw new Error("После --email нужен адрес: npm run seed:articles -- --email you@example.com");
    }
    email = value.toLowerCase();
  }
  return { email, force: argv.includes("--force") };
};

// Контентные поля, одинаковые для insert и force-update. isFeatured сюда не
// входит: это курационное состояние (снимается/ставится из админки), --force
// не должен его откатывать.
const contentFields = (article: EditorialArticle) => ({
  type: article.type,
  title: article.title,
  excerpt: article.excerpt,
  bodyJson: article.body as unknown as Record<string, unknown>,
  coverImageUrl: article.coverImageUrl ?? null,
  seoTitle: article.seoTitle ?? null,
  seoDescription: article.seoDescription ?? null,
  readingMinutes: estimateReadingMinutes(article.body)
});

const main = async () => {
  assertDevOnly();
  const { email, force } = parseArgs(process.argv.slice(2));

  const [user] = await db
    .insert(users)
    .values({ email, displayName: email.split("@")[0] ?? "Editor", emailVerified: true })
    .onConflictDoUpdate({ target: users.email, set: { emailVerified: true, updatedAt: new Date() } })
    .returning();
  if (!user) throw new Error(`Не удалось создать/найти пользователя ${email}.`);
  console.log(`👤  Автор: ${email} (${user.id})`);

  for (const article of EDITORIAL_ARTICLES) {
    const existing = await db.query.contentArticles.findFirst({
      where: eq(contentArticles.slug, article.slug),
      columns: { id: true, status: true }
    });

    if (!existing) {
      const now = new Date();
      await db.insert(contentArticles).values({
        ...contentFields(article),
        slug: article.slug,
        status: "published",
        isFeatured: article.featured,
        authorId: user.id,
        publishedAt: now
      });
      console.log(`📰  Опубликована: «${article.title}» → /articles/${article.slug}`);
      continue;
    }

    if (!force) {
      console.log(`⏭️   Пропущена (уже в БД, запусти с --force для перезаписи): /articles/${article.slug}`);
      continue;
    }

    await db.update(contentArticles)
      .set({ ...contentFields(article), updatedAt: new Date() })
      .where(eq(contentArticles.id, existing.id));
    console.log(`♻️   Обновлена из репозитория: «${article.title}» → /articles/${article.slug}`);
  }

  console.log("\n✅  Готово. Смотри /articles и главную (featured-блок).");
  process.exit(0);
};

main().catch((error) => {
  console.error("❌  seed:articles упал:", error?.stack ?? error?.message ?? error);
  process.exit(1);
});
