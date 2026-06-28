import { beforeEach, describe, expect, it, vi } from "vitest";

// Сервис-слой контент-CMS тестируем БЕЗ реальной БД: @nb/db мокается in-memory
// через vi.hoisted + vi.mock, а server-only глушится. Структура мок-харнесса
// скопирована со стиля tests/recipe-saves-service.test.ts.
vi.mock("server-only", () => ({}));

type Row = Record<string, any>;

const { mockState } = vi.hoisted(() => ({
  mockState: {
    articles: [] as Row[],
    authors: {} as Record<string, string | null>,
    seq: 0
  }
}));

vi.mock("@nb/db", () => {
  // Токен таблицы: доступ к колонке отдаёт строку "table.column",
  // её несут операторы eq/inArray/desc.
  const tableToken = (name: string) =>
    new Proxy({} as Record<string, string>, { get: (_t, prop) => `${name}.${String(prop)}` });

  // Рекурсивно собираем eq/inArray-ограничения из вложенного where (and/eq/inArray).
  const collectConstraints = (clause: unknown) => {
    const eqs: Record<string, unknown> = {};
    const ins: Record<string, unknown[]> = {};
    const walk = (node: unknown): void => {
      if (!Array.isArray(node)) {
        return;
      }
      const op = node[0];
      if (op === "eq") {
        eqs[String(node[1])] = node[2];
        return;
      }
      if (op === "inArray") {
        ins[String(node[1])] = node[2] as unknown[];
        return;
      }
      // and/or либо «голый» массив условий — спускаемся внутрь.
      node.forEach(walk);
    };
    walk(clause);
    return { eqs, ins };
  };

  const field = (col: string) => col.split(".").pop() as string;

  const matches = (row: Row, c: { eqs: Record<string, unknown>; ins: Record<string, unknown[]> }) => {
    for (const [col, value] of Object.entries(c.eqs)) {
      if (row[field(col)] !== value) {
        return false;
      }
    }
    for (const [col, values] of Object.entries(c.ins)) {
      if (!values.includes(row[field(col)])) {
        return false;
      }
    }
    return true;
  };

  const toNum = (value: unknown) =>
    value instanceof Date ? value.getTime() : value == null ? -Infinity : (value as number);

  const applyOrder = (rows: Row[], orderBy: unknown): Row[] => {
    if (!Array.isArray(orderBy) || orderBy.length === 0) {
      return rows;
    }
    const [dir, col] = orderBy[0] as [string, string];
    const key = field(col);
    return [...rows].sort((a, b) =>
      dir === "desc" ? toNum(b[key]) - toNum(a[key]) : toNum(a[key]) - toNum(b[key])
    );
  };

  const attachAuthor = (row: Row): Row => ({
    ...row,
    author: row.authorId ? { displayName: mockState.authors[row.authorId] ?? null } : null
  });

  const contentArticles = tableToken("contentArticles");

  const db = {
    query: {
      contentArticles: {
        findFirst: async (arg: { where?: unknown; with?: { author?: unknown } }) => {
          const c = collectConstraints(arg.where);
          const row = mockState.articles.find((r) => matches(r, c));
          if (!row) {
            return null;
          }
          return arg.with?.author ? attachAuthor(row) : { ...row };
        },
        findMany: async (arg: { where?: unknown; with?: { author?: unknown }; orderBy?: unknown; limit?: number }) => {
          const c = collectConstraints(arg.where);
          let rows = mockState.articles.filter((r) => matches(r, c));
          rows = applyOrder(rows, arg.orderBy);
          if (typeof arg.limit === "number") {
            rows = rows.slice(0, arg.limit);
          }
          return rows.map((r) => (arg.with?.author ? attachAuthor(r) : { ...r }));
        }
      }
    },
    insert: (_token: unknown) => ({
      values: (values: Row) => ({
        returning: () => {
          mockState.seq += 1;
          const now = new Date();
          const row: Row = {
            id: `article-${mockState.seq}`,
            isFeatured: false,
            reviewerId: null,
            publishedAt: null,
            createdAt: now,
            updatedAt: now,
            ...values
          };
          mockState.articles.push(row);
          return Promise.resolve([{ ...row }]);
        }
      })
    }),
    update: (_token: unknown) => ({
      set: (values: Row) => ({
        where: (clause: unknown) => ({
          returning: () => {
            const { eqs } = collectConstraints(clause);
            const id = eqs["contentArticles.id"];
            const row = mockState.articles.find((r) => r.id === id);
            if (!row) {
              return Promise.resolve([]);
            }
            Object.assign(row, values);
            return Promise.resolve([{ ...row }]);
          }
        })
      })
    }),
    delete: (_token: unknown) => ({
      where: (clause: unknown) => {
        const { eqs } = collectConstraints(clause);
        const id = eqs["contentArticles.id"];
        mockState.articles = mockState.articles.filter((r) => r.id !== id);
        return Promise.resolve();
      }
    })
  };

  const sqlFn = (..._args: unknown[]) => ["sql"];
  (sqlFn as unknown as { raw: (v: unknown) => unknown }).raw = (value: unknown) => ({ raw: String(value) });

  return {
    db,
    sql: sqlFn,
    and: (...args: unknown[]) => ["and", ...args],
    or: (...args: unknown[]) => ["or", ...args],
    eq: (...args: unknown[]) => ["eq", ...args],
    gt: (...args: unknown[]) => ["gt", ...args],
    gte: (...args: unknown[]) => ["gte", ...args],
    lte: (...args: unknown[]) => ["lte", ...args],
    inArray: (...args: unknown[]) => ["inArray", ...args],
    asc: (value: unknown) => ["asc", value],
    desc: (value: unknown) => ["desc", value],
    contentArticles,
    // Токены/функции, которые @nb/auth тянет на верхнем уровне из @nb/db.
    accounts: tableToken("accounts"),
    authRateLimits: tableToken("authRateLimits"),
    sessions: tableToken("sessions"),
    users: tableToken("users"),
    verifications: tableToken("verifications")
  };
});

import {
  createContentArticle,
  updateContentArticle,
  setContentArticlePublication,
  setContentArticleFeatured,
  deleteContentArticle,
  listAdminContentArticles,
  getContentArticleForEditor,
  listPublishedContentArticles,
  getPublishedContentArticleBySlug,
  listFeaturedContentArticles,
  listPublishedContentArticlesByIds,
  type ContentActor
} from "@/features/content-articles/service";
import type { ContentArticleInput } from "@/features/content-articles/contracts";

// --- Акторы по ролям -----------------------------------------------------------
const USER: ContentActor = { id: "user-1", role: "user" };
const EDITOR: ContentActor = { id: "editor-1", role: "editor" };
const EDITOR_2: ContentActor = { id: "editor-2", role: "editor" };
const MODERATOR: ContentActor = { id: "moderator-1", role: "moderator" };
const ADMIN: ContentActor = { id: "admin-1", role: "admin" };

const makeInput = (overrides: Partial<ContentArticleInput> = {}): ContentArticleInput =>
  ({
    title: "Pale Ale Guide",
    type: "guide",
    excerpt: null,
    bodyJson: null,
    metaJson: undefined,
    coverImageUrl: null,
    seoTitle: null,
    seoDescription: null,
    ...overrides
  }) as ContentArticleInput;

// Прямой посев готовой строки в стейт — для read-path тестов с контролем дат.
let seedClock = 0;
const seedArticle = (partial: Partial<Row> = {}): Row => {
  mockState.seq += 1;
  seedClock += 1;
  const ts = new Date(Date.UTC(2026, 0, 1) + seedClock * 60_000);
  const row: Row = {
    id: `seed-${mockState.seq}`,
    type: "guide",
    status: "published",
    slug: `slug-${mockState.seq}`,
    title: `Article ${mockState.seq}`,
    excerpt: null,
    bodyJson: null,
    metaJson: {},
    coverImageUrl: null,
    seoTitle: null,
    seoDescription: null,
    readingMinutes: 1,
    isFeatured: false,
    authorId: EDITOR.id,
    reviewerId: MODERATOR.id,
    publishedAt: ts,
    createdAt: ts,
    updatedAt: ts,
    ...partial
  };
  mockState.articles.push(row);
  return row;
};

beforeEach(() => {
  mockState.articles = [];
  mockState.authors = {
    [EDITOR.id]: "Editor One",
    [EDITOR_2.id]: "Editor Two",
    [MODERATOR.id]: "Moderator One",
    [ADMIN.id]: "Admin One"
  };
  mockState.seq = 0;
  seedClock = 0;
});

// --- Полный жизненный цикл ------------------------------------------------------
describe("жизненный цикл статьи: черновик → правка → публикация → featured → снятие → удаление", () => {
  it("проходит весь путь со сменой ролей на привилегированных шагах", async () => {
    // editor создаёт черновик
    const draft = await createContentArticle(EDITOR, makeInput({ title: "Pale Ale Guide" }));
    expect(draft.status).toBe("draft");
    expect(draft.isFeatured).toBe(false);
    expect(draft.authorId).toBe(EDITOR.id);
    expect(draft.slug).toBe("pale-ale-guide");
    expect(draft.publishedAt).toBeNull();

    // editor (автор) правит черновик — слаг переезжает за новым заголовком
    const edited = await updateContentArticle(EDITOR, draft.id, makeInput({ title: "Stout Guide" }));
    expect(edited.title).toBe("Stout Guide");
    expect(edited.slug).toBe("stout-guide");

    // moderator публикует
    const published = await setContentArticlePublication(MODERATOR, draft.id, true);
    expect(published.status).toBe("published");
    expect(published.publishedAt).toBeInstanceOf(Date);
    expect(published.reviewerId).toBe(MODERATOR.id);

    // moderator помечает featured
    const featured = await setContentArticleFeatured(MODERATOR, draft.id, true);
    expect(featured.isFeatured).toBe(true);

    // moderator снимает с публикации — publishedAt сохраняется, featured не трогается
    const firstPublishedAt = published.publishedAt;
    const unpublished = await setContentArticlePublication(MODERATOR, draft.id, false);
    expect(unpublished.status).toBe("draft");
    expect(unpublished.publishedAt).toEqual(firstPublishedAt);
    expect(unpublished.isFeatured).toBe(true);

    // editor (автор) удаляет
    await deleteContentArticle(EDITOR, draft.id);
    expect(await getContentArticleForEditor(MODERATOR, draft.id)).toBeNull();
  });

  it("повторная публикация сохраняет исходный publishedAt", async () => {
    const draft = await createContentArticle(EDITOR, makeInput());
    const first = await setContentArticlePublication(ADMIN, draft.id, true);
    await setContentArticlePublication(ADMIN, draft.id, false);
    const second = await setContentArticlePublication(ADMIN, draft.id, true);
    expect(second.publishedAt).toEqual(first.publishedAt);
  });
});

// --- Слаг: генерация и уникальность --------------------------------------------
describe("генерация и уникальность слага", () => {
  it("второй черновик с тем же заголовком получает суффикс -2", async () => {
    const a = await createContentArticle(EDITOR, makeInput({ title: "India Pale Ale" }));
    const b = await createContentArticle(EDITOR, makeInput({ title: "India Pale Ale" }));
    const c = await createContentArticle(EDITOR, makeInput({ title: "India Pale Ale" }));
    expect(a.slug).toBe("india-pale-ale");
    expect(b.slug).toBe("india-pale-ale-2");
    expect(c.slug).toBe("india-pale-ale-3");
  });

  it("слаг замораживается после публикации: правка заголовка не меняет URL", async () => {
    const draft = await createContentArticle(EDITOR, makeInput({ title: "Hazy IPA" }));
    expect(draft.slug).toBe("hazy-ipa");
    await setContentArticlePublication(MODERATOR, draft.id, true);
    const renamed = await updateContentArticle(MODERATOR, draft.id, makeInput({ title: "Totally New Title" }));
    expect(renamed.title).toBe("Totally New Title");
    expect(renamed.slug).toBe("hazy-ipa");
  });

  it("правка черновика без смены заголовка сохраняет слаг", async () => {
    const draft = await createContentArticle(EDITOR, makeInput({ title: "Saison Notes" }));
    const updated = await updateContentArticle(EDITOR, draft.id, makeInput({ title: "Saison Notes", excerpt: "x" }));
    expect(updated.slug).toBe(draft.slug);
  });
});

// --- Ролевые гейты на запись ----------------------------------------------------
describe("ролевые гейты записи", () => {
  it("create: user без прав → FORBIDDEN, editor/moderator/admin → разрешено", async () => {
    await expect(createContentArticle(USER, makeInput())).rejects.toThrow("FORBIDDEN");
    expect(mockState.articles).toHaveLength(0);

    for (const actor of [EDITOR, MODERATOR, ADMIN]) {
      const created = await createContentArticle(actor, makeInput({ title: `By ${actor.role}` }));
      expect(created.authorId).toBe(actor.id);
    }
  });

  it("update: автор-editor может, чужой editor — FORBIDDEN, moderator/admin — может любой", async () => {
    const draft = await createContentArticle(EDITOR, makeInput({ title: "Owned by editor" }));

    // автор правит — ок
    await expect(updateContentArticle(EDITOR, draft.id, makeInput({ title: "Owned by editor" }))).resolves.toBeTruthy();
    // другой editor — FORBIDDEN
    await expect(updateContentArticle(EDITOR_2, draft.id, makeInput({ title: "Hijack" }))).rejects.toThrow("FORBIDDEN");
    // moderator может чужую
    await expect(updateContentArticle(MODERATOR, draft.id, makeInput({ title: "Owned by editor" }))).resolves.toBeTruthy();
    // admin может чужую
    await expect(updateContentArticle(ADMIN, draft.id, makeInput({ title: "Owned by editor" }))).resolves.toBeTruthy();
  });

  it("publish: editor → FORBIDDEN, moderator/admin → разрешено", async () => {
    const draft = await createContentArticle(EDITOR, makeInput());
    await expect(setContentArticlePublication(EDITOR, draft.id, true)).rejects.toThrow("FORBIDDEN");
    await expect(setContentArticlePublication(MODERATOR, draft.id, true)).resolves.toMatchObject({ status: "published" });
  });

  it("featured: editor → FORBIDDEN, moderator/admin → разрешено", async () => {
    const draft = await createContentArticle(EDITOR, makeInput());
    await expect(setContentArticleFeatured(EDITOR, draft.id, true)).rejects.toThrow("FORBIDDEN");
    await expect(setContentArticleFeatured(MODERATOR, draft.id, true)).resolves.toMatchObject({ isFeatured: true });
  });

  it("delete: чужой editor → FORBIDDEN, автор и moderator → разрешено", async () => {
    const draft = await createContentArticle(EDITOR, makeInput({ title: "Deletable" }));
    await expect(deleteContentArticle(EDITOR_2, draft.id)).rejects.toThrow("FORBIDDEN");
    expect(mockState.articles).toHaveLength(1);

    const draft2 = await createContentArticle(EDITOR, makeInput({ title: "Deletable Two" }));
    await deleteContentArticle(MODERATOR, draft2.id); // модератор удаляет чужую
    await deleteContentArticle(EDITOR, draft.id); // автор удаляет свою
    expect(mockState.articles).toHaveLength(0);
  });

  it("операции над несуществующей статьёй → NOT_FOUND", async () => {
    await expect(updateContentArticle(MODERATOR, "ghost", makeInput())).rejects.toThrow("NOT_FOUND");
    await expect(setContentArticlePublication(MODERATOR, "ghost", true)).rejects.toThrow("NOT_FOUND");
    await expect(setContentArticleFeatured(MODERATOR, "ghost", true)).rejects.toThrow("NOT_FOUND");
    await expect(deleteContentArticle(MODERATOR, "ghost")).rejects.toThrow("NOT_FOUND");
  });
});

// --- getContentArticleForEditor: гейт по id ------------------------------------
describe("getContentArticleForEditor", () => {
  it("user без прав на редактирование → FORBIDDEN", async () => {
    const draft = await createContentArticle(EDITOR, makeInput());
    await expect(getContentArticleForEditor(USER, draft.id)).rejects.toThrow("FORBIDDEN");
  });

  it("editor видит свой черновик с именем автора, но не чужой (null)", async () => {
    const own = await createContentArticle(EDITOR, makeInput({ title: "Mine" }));
    const other = await createContentArticle(EDITOR_2, makeInput({ title: "Theirs" }));

    const mine = await getContentArticleForEditor(EDITOR, own.id);
    expect(mine?.id).toBe(own.id);
    expect(mine?.authorName).toBe("Editor One");

    expect(await getContentArticleForEditor(EDITOR, other.id)).toBeNull();
  });

  it("moderator/admin видят чужой черновик", async () => {
    const other = await createContentArticle(EDITOR, makeInput({ title: "Foreign" }));
    expect((await getContentArticleForEditor(MODERATOR, other.id))?.id).toBe(other.id);
    expect((await getContentArticleForEditor(ADMIN, other.id))?.id).toBe(other.id);
  });

  it("несуществующий id → null (а не исключение)", async () => {
    expect(await getContentArticleForEditor(MODERATOR, "ghost")).toBeNull();
  });
});

// --- Публичные листинги: только опубликованное ---------------------------------
describe("публичные листинги отдают только published", () => {
  it("черновик не виден в listPublished и по slug, после публикации — виден", async () => {
    const draft = await createContentArticle(EDITOR, makeInput({ title: "Secret Draft" }));
    expect(await listPublishedContentArticles()).toHaveLength(0);
    expect(await getPublishedContentArticleBySlug(draft.slug)).toBeNull();

    await setContentArticlePublication(MODERATOR, draft.id, true);
    const list = await listPublishedContentArticles();
    expect(list.map((a) => a.id)).toEqual([draft.id]);
    expect((await getPublishedContentArticleBySlug(draft.slug))?.id).toBe(draft.id);
  });

  it("archived не попадает в публичный листинг", async () => {
    seedArticle({ status: "published", title: "Live" });
    seedArticle({ status: "archived", title: "Old" });
    const list = await listPublishedContentArticles();
    expect(list.map((a) => a.title)).toEqual(["Live"]);
  });

  it("сортирует по publishedAt desc и фильтрует по type", async () => {
    const a = seedArticle({ type: "guide", title: "First guide" });
    const b = seedArticle({ type: "review", title: "A review" });
    const c = seedArticle({ type: "guide", title: "Latest guide" });

    const all = await listPublishedContentArticles();
    // самые свежие publishedAt первыми
    expect(all.map((x) => x.id)).toEqual([c.id, b.id, a.id]);

    const guides = await listPublishedContentArticles({ type: "guide" });
    expect(guides.map((x) => x.id)).toEqual([c.id, a.id]);

    const limited = await listPublishedContentArticles({ limit: 1 });
    expect(limited.map((x) => x.id)).toEqual([c.id]);
  });
});

// --- Featured листинг и его лимит -----------------------------------------------
describe("listFeaturedContentArticles", () => {
  it("отдаёт только published+featured, уважает лимит (по умолчанию 3) и порядок", async () => {
    const f1 = seedArticle({ isFeatured: true, title: "F1" });
    const f2 = seedArticle({ isFeatured: true, title: "F2" });
    const f3 = seedArticle({ isFeatured: true, title: "F3" });
    const f4 = seedArticle({ isFeatured: true, title: "F4" });
    seedArticle({ isFeatured: false, title: "Plain published" }); // не featured
    seedArticle({ isFeatured: true, status: "draft", title: "Featured draft" }); // не published

    const top3 = await listFeaturedContentArticles();
    // три самых свежих featured published
    expect(top3.map((a) => a.id)).toEqual([f4.id, f3.id, f2.id]);
    expect(top3.every((a) => a.isFeatured)).toBe(true);

    const top2 = await listFeaturedContentArticles(2);
    expect(top2.map((a) => a.id)).toEqual([f4.id, f3.id]);
    expect(f1).toBeTruthy(); // f1 вытеснен лимитом
  });
});

// --- listPublishedContentArticlesByIds ------------------------------------------
describe("listPublishedContentArticlesByIds", () => {
  it("пустой список id → пустой результат без обращения к БД", async () => {
    expect(await listPublishedContentArticlesByIds([])).toEqual([]);
  });

  it("фильтрует до published и игнорирует черновики/неизвестные id", async () => {
    const a = seedArticle({ status: "published", title: "Pub A" });
    const b = seedArticle({ status: "published", title: "Pub B" });
    const draft = seedArticle({ status: "draft", title: "Draft C" });

    const rows = await listPublishedContentArticlesByIds([b.id, draft.id, "unknown", a.id]);
    const ids = rows.map((r) => r.id);
    // только опубликованные a и b
    expect(ids).toHaveLength(2);
    expect(ids).toContain(a.id);
    expect(ids).toContain(b.id);
    expect(ids).not.toContain(draft.id);
  });
});

// --- Админский листинг ----------------------------------------------------------
describe("listAdminContentArticles", () => {
  it("видит все статусы и фильтрует по type/status, сортируя по updatedAt desc", async () => {
    seedArticle({ status: "draft", type: "guide", title: "Draft guide" });
    seedArticle({ status: "published", type: "review", title: "Pub review" });
    seedArticle({ status: "archived", type: "guide", title: "Archived guide" });

    const all = await listAdminContentArticles();
    expect(all).toHaveLength(3);

    const drafts = await listAdminContentArticles({ status: "draft" });
    expect(drafts.map((a) => a.title)).toEqual(["Draft guide"]);

    const reviews = await listAdminContentArticles({ type: "review" });
    expect(reviews.map((a) => a.title)).toEqual(["Pub review"]);

    const draftGuides = await listAdminContentArticles({ status: "draft", type: "guide" });
    expect(draftGuides.map((a) => a.title)).toEqual(["Draft guide"]);
  });
});
