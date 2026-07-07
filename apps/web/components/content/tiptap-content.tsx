import React from "react";
import Link from "next/link";

import type { TiptapDoc, TiptapNode } from "@/features/content-articles/contracts";

import { FirstBrewScaleWidget } from "./first-brew-scale-widget";

// Серверный рендер Tiptap ProseMirror-JSON в React (без dangerouslySetInnerHTML).
// Поддерживает узлы StarterKit + link + figure/image. Неизвестные узлы
// пропускаются; href ссылок и src картинок санитайзятся.

const isRootRelative = (value: string): boolean =>
  value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\");

const isSafeHref = (href: unknown): href is string => {
  if (typeof href !== "string" || !href.trim()) {
    return false;
  }
  // Якорь — безопасен. Относительный путь — только от корня, но НЕ protocol-
  // relative ("//host") и не backslash-трюк ("/\\host"), которые ведут off-site.
  if (href.startsWith("#")) {
    return true;
  }
  if (isRootRelative(href)) {
    return true;
  }
  return /^(https?:|mailto:)/i.test(href);
};

// Узел widget: интерактивная вставка в статье (клиентский компонент).
// В bodyJson хранится только имя ({ type: "widget", attrs: { name } }),
// маппинг имя → компонент живёт здесь; неизвестные имена не рендерятся.
const widgetRegistry: Record<string, React.ComponentType> = {
  "first-brew-scale": FirstBrewScaleWidget
};

// src картинки: только путь от корня или http(s). Без mailto/anchor/data:.
const isSafeSrc = (src: unknown): src is string =>
  typeof src === "string" && src.trim().length > 0 && (isRootRelative(src) || /^https?:/i.test(src));

// Узел figure: иллюстрация с подписью. Пока src нет — рендерим видимую
// заглушку (пунктирный бокс с описанием кадра из attrs.hint/caption), чтобы
// автор видел слот и позже вписал реальное фото. attrs: { src?, alt?, caption?,
// hint?, aspect?, width?, height? }.
const renderFigure = (node: TiptapNode, key: React.Key): React.ReactNode => {
  const attrs = node.attrs ?? {};
  const src = attrs.src;
  const caption = typeof attrs.caption === "string" && attrs.caption.trim() ? attrs.caption.trim() : null;
  const hint = typeof attrs.hint === "string" && attrs.hint.trim() ? attrs.hint.trim() : caption;
  const alt = typeof attrs.alt === "string" ? attrs.alt : (caption ?? "");
  const aspect = typeof attrs.aspect === "string" && attrs.aspect.trim() ? attrs.aspect.trim() : "3 / 2";
  // Реальные габариты узла (если автор/загрузка их записали) — на них браузер
  // резервирует место сам (native width/height работают вместе с "w-full" в
  // CSS, аспект считается из атрибутов даже при растянутой ширине). Без них —
  // тот же приём, что и у заглушки: контейнер с фиксированным aspect-ratio.
  const width = typeof attrs.width === "number" && attrs.width > 0 ? attrs.width : null;
  const height = typeof attrs.height === "number" && attrs.height > 0 ? attrs.height : null;

  return (
    <figure key={key} className="my-2 space-y-2">
      {isSafeSrc(src) ? (
        width && height ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={alt}
            width={width}
            height={height}
            loading="lazy"
            decoding="async"
            className="h-auto w-full rounded-2xl border border-border object-cover"
          />
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border" style={{ aspectRatio: aspect }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt={alt} loading="lazy" decoding="async" className="h-full w-full object-cover" />
          </div>
        )
      ) : (
        <div
          className="flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border bg-muted px-6 py-8 text-center"
          style={{ aspectRatio: aspect }}
          role="img"
          aria-label={hint ? `Место для фото: ${hint}` : "Место для фото"}
        >
          <svg viewBox="0 0 24 24" className="h-7 w-7 text-muted-foreground" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden>
            <path d="M3 8.5A2.5 2.5 0 0 1 5.5 6h1.2l.9-1.5A1.5 1.5 0 0 1 8.9 4h6.2a1.5 1.5 0 0 1 1.3.5L17.3 6h1.2A2.5 2.5 0 0 1 21 8.5v8A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5z" strokeLinejoin="round" />
            <circle cx="12" cy="12" r="3.2" />
          </svg>
          {hint ? <span className="max-w-md text-sm leading-6 text-muted-foreground">{hint}</span> : null}
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Фото</span>
        </div>
      )}
      {caption ? <figcaption className="text-center text-sm text-muted-foreground">{caption}</figcaption> : null}
    </figure>
  );
};

const renderText = (node: TiptapNode, key: React.Key): React.ReactNode => {
  let element: React.ReactNode = node.text ?? "";
  for (const mark of node.marks ?? []) {
    switch (mark.type) {
      case "bold":
        element = <strong>{element}</strong>;
        break;
      case "italic":
        element = <em>{element}</em>;
        break;
      case "strike":
        element = <s>{element}</s>;
        break;
      case "code":
        element = <code className="rounded bg-muted px-1 py-0.5 text-[0.9em]">{element}</code>;
        break;
      case "link": {
        const href = mark.attrs?.href;
        if (!isSafeHref(href)) {
          break;
        }
        const linkClassName = "text-link underline underline-offset-4";
        // Внутренние ссылки — клиентская навигация и без nofollow (это наш
        // же контент); nofollow/noopener оставляем только внешним URL.
        element = href.startsWith("/") ? (
          <Link href={href} className={linkClassName}>{element}</Link>
        ) : href.startsWith("#") ? (
          <a href={href} className={linkClassName}>{element}</a>
        ) : (
          <a href={href} rel="noopener noreferrer nofollow" className={linkClassName}>{element}</a>
        );
        break;
      }
      default:
        break;
    }
  }
  return <React.Fragment key={key}>{element}</React.Fragment>;
};

const renderChildren = (nodes: TiptapNode[] | undefined): React.ReactNode =>
  (nodes ?? []).map((child, index) => renderNode(child, index));

const renderNode = (node: TiptapNode | null | undefined, key: React.Key): React.ReactNode => {
  if (!node || typeof node !== "object") {
    return null;
  }
  switch (node.type) {
    case "text":
      return renderText(node, key);
    case "paragraph":
      return <p key={key} className="leading-7 text-foreground">{renderChildren(node.content)}</p>;
    case "heading": {
      const level = typeof node.attrs?.level === "number" ? node.attrs.level : 2;
      const className = level <= 2
        ? "mt-8 text-2xl font-semibold text-foreground"
        : level === 3
          ? "mt-6 text-xl font-semibold text-foreground"
          : "mt-5 text-lg font-semibold text-foreground";
      const Tag = (level === 2 ? "h2" : level === 3 ? "h3" : "h4") as "h2" | "h3" | "h4";
      return <Tag key={key} className={className}>{renderChildren(node.content)}</Tag>;
    }
    case "bulletList":
      return <ul key={key} className="list-disc space-y-1 pl-6 text-foreground">{renderChildren(node.content)}</ul>;
    case "orderedList":
      return <ol key={key} className="list-decimal space-y-1 pl-6 text-foreground">{renderChildren(node.content)}</ol>;
    case "listItem":
      return <li key={key} className="leading-7">{renderChildren(node.content)}</li>;
    case "blockquote":
      return (
        <blockquote key={key} className="border-l-4 border-border pl-4 italic text-muted-foreground">
          {renderChildren(node.content)}
        </blockquote>
      );
    case "codeBlock":
      return (
        <pre key={key} className="overflow-auto rounded-xl bg-foreground p-4 text-sm leading-6 text-background">
          <code>{renderChildren(node.content)}</code>
        </pre>
      );
    case "figure":
      return renderFigure(node, key);
    case "widget": {
      const name = node.attrs?.name;
      const Widget = typeof name === "string" ? widgetRegistry[name] : undefined;
      return Widget ? <Widget key={key} /> : null;
    }
    case "image": {
      // Стандартный узел Tiptap Image (на случай вставки из редактора) —
      // переиспользуем рендер figure.
      const attrs = node.attrs ?? {};
      return renderFigure(
        {
          type: "figure",
          attrs: {
            src: attrs.src,
            alt: attrs.alt,
            caption: attrs.title ?? attrs.alt,
            width: attrs.width,
            height: attrs.height
          }
        },
        key
      );
    }
    case "horizontalRule":
      return <hr key={key} className="border-border" />;
    case "hardBreak":
      return <br key={key} />;
    default:
      // Неизвестный узел: рендерим детей, чтобы не терять текст.
      return node.content ? <React.Fragment key={key}>{renderChildren(node.content)}</React.Fragment> : null;
  }
};

export function TiptapContent({ doc }: { doc: TiptapDoc | null }) {
  if (!doc || !Array.isArray(doc.content) || doc.content.length === 0) {
    return null;
  }
  return <div className="space-y-4">{renderChildren(doc.content)}</div>;
}
