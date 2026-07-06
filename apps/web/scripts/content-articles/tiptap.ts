import type { TiptapDoc, TiptapNode } from "../../features/content-articles/contracts";

// Мини-конструкторы Tiptap ProseMirror-JSON для редакционных статей, хранящихся
// в репозитории (scripts/content-articles/*). Покрывают узлы, которые понимает
// рендерер components/content/tiptap-content.tsx и редактор админки (StarterKit + link).

type Inline = string | TiptapNode;

const toInline = (value: Inline): TiptapNode =>
  typeof value === "string" ? { type: "text", text: value } : value;

/** Жирный текст (mark bold). */
export const b = (text: string): TiptapNode => ({ type: "text", text, marks: [{ type: "bold" }] });

/** Ссылка (mark link); href — относительный путь или http(s). */
export const link = (text: string, href: string): TiptapNode => ({
  type: "text",
  text,
  marks: [{ type: "link", attrs: { href } }]
});

/** Абзац из строк и inline-узлов. */
export const p = (...children: Inline[]): TiptapNode => ({
  type: "paragraph",
  content: children.map(toInline)
});

/** Заголовок второго уровня. */
export const h2 = (text: string): TiptapNode => ({
  type: "heading",
  attrs: { level: 2 },
  content: [{ type: "text", text }]
});

/** Пункт списка (один абзац внутри). */
export const li = (...children: Inline[]): TiptapNode => ({
  type: "listItem",
  content: [{ type: "paragraph", content: children.map(toInline) }]
});

/** Маркированный список из пунктов li(...). */
export const ul = (...items: TiptapNode[]): TiptapNode => ({
  type: "bulletList",
  content: items
});

/** Цитата/выноска из абзацев p(...). */
export const quote = (...paragraphs: TiptapNode[]): TiptapNode => ({
  type: "blockquote",
  content: paragraphs
});

/**
 * Иллюстрация с подписью. Без `src` рендерер покажет видимую заглушку
 * (пунктирный бокс с текстом `hint`/`caption`) — слот под будущее фото.
 * Когда фото готово: положить файл в public/images/articles/... и вписать `src`.
 * - caption — подпись, видимая читателю всегда;
 * - hint — что снять (показывается только в пустом слоте);
 * - aspect — соотношение сторон бокса-заглушки, напр. "3 / 2", "16 / 9", "1 / 1".
 */
export const figure = (attrs: {
  src?: string;
  alt?: string;
  caption?: string;
  hint?: string;
  aspect?: string;
}): TiptapNode => ({ type: "figure", attrs });

/**
 * Интерактивная вставка. `name` должен быть зарегистрирован в widgetRegistry
 * рендерера (components/content/tiptap-content.tsx), иначе узел не отрисуется.
 */
export const widget = (name: string): TiptapNode => ({ type: "widget", attrs: { name } });

/** Документ верхнего уровня. */
export const doc = (...content: TiptapNode[]): TiptapDoc => ({ type: "doc", content });
