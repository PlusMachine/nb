import { getSchema } from "@tiptap/core";
import { describe, expect, it } from "vitest";

import { contentArticleInputSchema } from "../features/content-articles/contracts";
import { contentEditorExtensions, toPlainTiptapDoc } from "../features/content-articles/tiptap-schema";
import { EDITORIAL_ARTICLES } from "../scripts/content-articles";

// Узел, известный публичному рендеру, но не схеме редактора, открывал статью
// пустой: Tiptap глотает RangeError и подменяет документ пустым, а «Сохранить»
// затирал текст. Тест ловит это до живого прогона: любой новый узел обязан
// сначала появиться в features/content-articles/tiptap-schema.ts.

const schema = getSchema(contentEditorExtensions());

const collectNodeTypes = (node: unknown, into: Set<string>): Set<string> => {
  if (!node || typeof node !== "object") {
    return into;
  }
  const typed = node as { type?: unknown; content?: unknown; marks?: unknown };
  if (typeof typed.type === "string") {
    into.add(typed.type);
  }
  if (Array.isArray(typed.content)) {
    for (const child of typed.content) {
      collectNodeTypes(child, into);
    }
  }
  return into;
};

describe("схема редактора статей", () => {
  it("знает узлы figure и widget", () => {
    expect(schema.nodes.figure).toBeDefined();
    expect(schema.nodes.widget).toBeDefined();
  });

  it.each(EDITORIAL_ARTICLES.map((article) => [article.slug, article] as const))(
    "разбирает тело статьи «%s» без потерь",
    (_slug, article) => {
      const parsed = schema.nodeFromJSON(article.body);

      expect(parsed.type.name).toBe("doc");
      expect(parsed.content.childCount).toBe(article.body.content?.length ?? 0);
    }
  );

  it("сохраняет атрибуты иллюстрации и имя вставки после round-trip", () => {
    const doc = {
      type: "doc" as const,
      content: [
        {
          type: "figure",
          attrs: { src: "/images/articles/kettle.jpg", alt: "Котёл", caption: "Котёл на 30 л", hint: null, aspect: "3 / 2", width: 1200, height: 800 }
        },
        { type: "widget", attrs: { name: "first-brew-scale" } }
      ]
    };

    const roundTripped = schema.nodeFromJSON(doc).toJSON() as typeof doc;

    expect(roundTripped.content[0]?.attrs).toMatchObject({
      src: "/images/articles/kettle.jpg",
      caption: "Котёл на 30 л",
      aspect: "3 / 2",
      width: 1200,
      height: 800
    });
    expect(roundTripped.content[1]?.attrs).toMatchObject({ name: "first-brew-scale" });
  });

  it("узел вне схемы роняет разбор (иначе редактор молча подменит тело пустым)", () => {
    expect(() =>
      schema.nodeFromJSON({ type: "doc", content: [{ type: "callout", content: [] }] })
    ).toThrow(/callout/);
  });
});

describe("документ на пути в server action", () => {
  // editor.getJSON() отдаёт attrs как Object.create(null) — React Server Actions
  // их не сериализуют и подменяют ссылкой "$T", теряя src/level/href.
  const documentFromEditor = () => {
    const figureAttrs = Object.create(null) as Record<string, unknown>;
    figureAttrs.src = "/images/articles/process-flow.svg";
    figureAttrs.caption = "Пять шагов";

    const linkAttrs = Object.create(null) as Record<string, unknown>;
    linkAttrs.href = "/catalog";

    const headingAttrs = Object.create(null) as Record<string, unknown>;
    headingAttrs.level = 2;

    return {
      type: "doc",
      content: [
        { type: "figure", attrs: figureAttrs },
        { type: "heading", attrs: headingAttrs, content: [{ type: "text", text: "Заголовок" }] },
        { type: "paragraph", content: [{ type: "text", text: "Ссылка", marks: [{ type: "link", attrs: linkAttrs }] }] }
      ]
    };
  };

  it("toPlainTiptapDoc делает attrs обычными объектами, не теряя значений", () => {
    const plain = toPlainTiptapDoc(documentFromEditor());
    const [figure, heading, paragraph] = plain.content ?? [];

    expect(Object.getPrototypeOf(figure?.attrs)).toBe(Object.prototype);
    expect(figure?.attrs).toEqual({ src: "/images/articles/process-flow.svg", caption: "Пять шагов" });
    expect(heading?.attrs).toEqual({ level: 2 });
    expect(paragraph?.content?.[0]?.marks?.[0]?.attrs).toEqual({ href: "/catalog" });
  });

  it("сервер отвергает тело с покалеченными attrs вместо тихой порчи статьи", () => {
    const broken = {
      title: "Статья",
      type: "guide" as const,
      // ровно то, что приходило от React: attrs подменены ссылкой
      bodyJson: { type: "doc", content: [{ type: "figure", attrs: "$T" }] }
    };

    expect(contentArticleInputSchema.safeParse(broken).success).toBe(false);
  });

  it("нормализованное тело проходит валидацию", () => {
    const result = contentArticleInputSchema.safeParse({
      title: "Статья",
      type: "guide" as const,
      bodyJson: toPlainTiptapDoc(documentFromEditor())
    });

    expect(result.success).toBe(true);
  });
});
