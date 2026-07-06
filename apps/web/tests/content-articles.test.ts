import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import { describe, expect, it } from "vitest";

import { toContentArticleSlugBase, appendSlugSuffix } from "@/features/content-articles/slug";
import { estimateReadingMinutes, extractPlainText } from "@/features/content-articles/reading-time";
import { TiptapContent } from "@/components/content/tiptap-content";
import type { TiptapDoc } from "@/features/content-articles/contracts";

describe("content article slug", () => {
  it("transliterates cyrillic titles", () => {
    expect(toContentArticleSlugBase("Как сварить IPA")).toBe("kak-svarit-ipa");
  });

  it("falls back to 'article' for empty/garbage titles", () => {
    expect(toContentArticleSlugBase("!!!")).toBe("article");
    expect(toContentArticleSlugBase("   ")).toBe("article");
  });

  it("appends suffix only from index 2", () => {
    expect(appendSlugSuffix("guide", 1)).toBe("guide");
    expect(appendSlugSuffix("guide", 2)).toBe("guide-2");
    expect(appendSlugSuffix("guide", 3)).toBe("guide-3");
  });
});

const doc: TiptapDoc = {
  type: "doc",
  content: [
    { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Заголовок" }] },
    { type: "paragraph", content: [{ type: "text", text: "Привет мир из пяти слов тут" }] }
  ]
};

describe("reading time", () => {
  it("estimates at least 1 minute", () => {
    expect(estimateReadingMinutes(null)).toBe(1);
    expect(estimateReadingMinutes(doc)).toBe(1);
  });

  it("scales with word count", () => {
    const long: TiptapDoc = {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: Array.from({ length: 400 }, () => "слово").join(" ") }] }]
    };
    expect(estimateReadingMinutes(long)).toBeGreaterThanOrEqual(3);
  });

  it("extracts plain text and truncates", () => {
    expect(extractPlainText(doc)).toContain("Заголовок");
    expect(extractPlainText(doc)).toContain("Привет мир");
    const long: TiptapDoc = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "a".repeat(500) }] }] };
    expect(extractPlainText(long, 100).length).toBeLessThanOrEqual(101);
    expect(extractPlainText(long, 100).endsWith("…")).toBe(true);
  });
});

describe("TiptapContent renderer", () => {
  it("renders headings, paragraphs and marks", () => {
    const html = renderToStaticMarkup(React.createElement(TiptapContent, { doc }));
    expect(html).toContain("<h2");
    expect(html).toContain("Заголовок");
    expect(html).toContain("<p");
    expect(html).toContain("Привет мир");
  });

  it("renders nothing for empty doc", () => {
    expect(renderToStaticMarkup(React.createElement(TiptapContent, { doc: null }))).toBe("");
    expect(renderToStaticMarkup(React.createElement(TiptapContent, { doc: { type: "doc", content: [] } }))).toBe("");
  });

  it("sanitizes dangerous link hrefs (drops javascript:)", () => {
    const evil: TiptapDoc = {
      type: "doc",
      content: [{
        type: "paragraph",
        content: [{ type: "text", text: "клик", marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }] }]
      }]
    };
    const html = renderToStaticMarkup(React.createElement(TiptapContent, { doc: evil }));
    expect(html).not.toContain("javascript:");
    expect(html).toContain("клик");
  });

  it("drops protocol-relative and backslash off-site hrefs", () => {
    const make = (href: string): TiptapDoc => ({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "x", marks: [{ type: "link", attrs: { href } }] }] }]
    });
    for (const href of ["//evil.com", "/\\evil.com"]) {
      const html = renderToStaticMarkup(React.createElement(TiptapContent, { doc: make(href) }));
      expect(html).not.toContain("href=");
    }
    // Обычный путь от корня остаётся ссылкой.
    const ok = renderToStaticMarkup(React.createElement(TiptapContent, { doc: make("/articles/x") }));
    expect(ok).toContain('href="/articles/x"');
  });

  it("keeps safe hrefs", () => {
    const safe: TiptapDoc = {
      type: "doc",
      content: [{
        type: "paragraph",
        content: [{ type: "text", text: "сайт", marks: [{ type: "link", attrs: { href: "https://example.com" } }] }]
      }]
    };
    const html = renderToStaticMarkup(React.createElement(TiptapContent, { doc: safe }));
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('rel="noopener noreferrer nofollow"');
  });

  it("renders known widgets and drops unknown ones", () => {
    const make = (name: unknown): TiptapDoc => ({
      type: "doc",
      content: [{ type: "widget", attrs: { name: name as string } }]
    });
    const known = renderToStaticMarkup(React.createElement(TiptapContent, { doc: make("first-brew-scale") }));
    expect(known).toContain("Пересчитать под свой объём");
    // База виджета совпадает с рецептом статьи: 8 л → 1,7 кг солода.
    expect(known).toContain("1,7");
    for (const name of ["no-such-widget", 42, undefined]) {
      const html = renderToStaticMarkup(React.createElement(TiptapContent, { doc: make(name) }));
      expect(html).not.toContain("widget");
      expect(html).not.toContain("Пересчитать");
    }
  });

  it("renders bold and bullet lists", () => {
    const rich: TiptapDoc = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "жирный", marks: [{ type: "bold" }] }] },
        { type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "пункт" }] }] }] }
      ]
    };
    const html = renderToStaticMarkup(React.createElement(TiptapContent, { doc: rich }));
    expect(html).toContain("<strong>жирный</strong>");
    expect(html).toContain("<ul");
    expect(html).toContain("<li");
  });
});
