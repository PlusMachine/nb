import { Node, mergeAttributes, type NodeViewRenderer } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";

import type { TiptapDoc } from "./contracts";

// Схема тела статьи: единственный источник истины о том, какие узлы бывают в
// bodyJson. Её обязаны знать все трое — билдеры репозиторных статей
// (scripts/content-articles/tiptap.ts), публичный рендер
// (components/content/tiptap-content.tsx) и редактор админки
// (components/content/content-body-editor.tsx).
//
// Узел, известный рендеру, но не схеме редактора, ронял открытие статьи:
// Tiptap на неизвестном типе бросает RangeError, глотает его (warning в
// консоль) и подставляет ПУСТОЙ документ — редактор открывался чистым, а
// сохранение затирало текст. Отсюда правило: новый узел заводится здесь и
// только потом используется в статьях. Тест tests/content-editor-schema.test.ts
// прогоняет все статьи репозитория через эту схему.

const linkOptions = {
  openOnClick: false,
  HTMLAttributes: { rel: "noopener noreferrer nofollow", class: "text-link underline underline-offset-4" }
};

const numericAttribute = (name: string) => ({
  default: null as number | null,
  parseHTML: (element: HTMLElement) => {
    const value = Number(element.getAttribute(name));
    return Number.isFinite(value) && value > 0 ? value : null;
  }
});

const stringAttribute = (name: string) => ({
  default: null as string | null,
  parseHTML: (element: HTMLElement) => element.getAttribute(name)
});

/**
 * Иллюстрация с подписью. Атомарный блок: текст внутрь не вводится, узел
 * целиком выделяется, перетаскивается и удаляется. Пустой `src` — намеренный
 * слот под будущее фото (рендер покажет заглушку с `hint`).
 */
export const FigureNode = Node.create({
  name: "figure",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes: () => ({
    src: stringAttribute("src"),
    alt: stringAttribute("alt"),
    caption: stringAttribute("data-caption"),
    hint: stringAttribute("data-hint"),
    aspect: stringAttribute("data-aspect"),
    width: numericAttribute("width"),
    height: numericAttribute("height")
  }),

  parseHTML: () => [{ tag: "figure[data-figure]" }],

  renderHTML: ({ HTMLAttributes }) => ["figure", mergeAttributes(HTMLAttributes, { "data-figure": "" })]
});

/**
 * Интерактивная вставка: в bodyJson живёт только имя, маппинг имя → компонент
 * держит рендер (widgetRegistry в components/content/tiptap-content.tsx).
 */
export const WidgetNode = Node.create({
  name: "widget",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes: () => ({
    name: stringAttribute("data-name")
  }),

  parseHTML: () => [{ tag: "div[data-widget]" }],

  renderHTML: ({ HTMLAttributes }) => ["div", mergeAttributes(HTMLAttributes, { "data-widget": "" })]
});

/**
 * Расширения тела статьи. Link идёт через StarterKit (в v3 он входит в набор;
 * отдельный @tiptap/extension-link дал бы дубликат имени).
 *
 * `nodeViews` подставляет редактор (React-вид атомарных узлов). Без них модуль
 * остаётся чистым от React и DOM — его читает тест схемы в node-окружении.
 */
export const contentEditorExtensions = (nodeViews?: {
  figure?: () => NodeViewRenderer;
  widget?: () => NodeViewRenderer;
}) => [
  StarterKit.configure({ heading: { levels: [2, 3, 4] }, link: linkOptions }),
  nodeViews?.figure ? FigureNode.extend({ addNodeView: nodeViews.figure }) : FigureNode,
  nodeViews?.widget ? WidgetNode.extend({ addNodeView: nodeViews.widget }) : WidgetNode
];

/**
 * ProseMirror собирает attrs через `Object.create(null)`, а React Server Actions
 * такие объекты не сериализуют — подставляют ссылку ("attrs": "$T"), и на сервер
 * приходит документ БЕЗ атрибутов: src иллюстраций, level заголовков, href
 * ссылок молча пропадают. Поэтому `editor.getJSON()` уходит в server action
 * только через эту нормализацию.
 */
export const toPlainTiptapDoc = (doc: unknown): TiptapDoc => JSON.parse(JSON.stringify(doc)) as TiptapDoc;
