import React from "react";

import type { TiptapDoc, TiptapNode } from "@/features/content-articles/contracts";

// Серверный рендер Tiptap ProseMirror-JSON в React (без dangerouslySetInnerHTML).
// Поддерживает узлы StarterKit + link. Неизвестные узлы пропускаются; href ссылок
// санитайзится (только http(s)/mailto/относительные пути).

const isSafeHref = (href: unknown): href is string => {
  if (typeof href !== "string" || !href.trim()) {
    return false;
  }
  // Якорь — безопасен. Относительный путь — только от корня, но НЕ protocol-
  // relative ("//host") и не backslash-трюк ("/\\host"), которые ведут off-site.
  if (href.startsWith("#")) {
    return true;
  }
  if (href.startsWith("/") && !href.startsWith("//") && !href.startsWith("/\\")) {
    return true;
  }
  return /^(https?:|mailto:)/i.test(href);
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
        element = <code className="rounded bg-zinc-100 px-1 py-0.5 text-[0.9em]">{element}</code>;
        break;
      case "link": {
        const href = mark.attrs?.href;
        element = isSafeHref(href) ? (
          <a href={href} rel="noopener noreferrer nofollow" className="text-sky-700 underline underline-offset-4">
            {element}
          </a>
        ) : (
          element
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
      return <p key={key} className="leading-7 text-zinc-700">{renderChildren(node.content)}</p>;
    case "heading": {
      const level = typeof node.attrs?.level === "number" ? node.attrs.level : 2;
      const className = level <= 2
        ? "mt-8 text-2xl font-semibold text-zinc-950"
        : level === 3
          ? "mt-6 text-xl font-semibold text-zinc-950"
          : "mt-5 text-lg font-semibold text-zinc-900";
      const Tag = (level === 2 ? "h2" : level === 3 ? "h3" : "h4") as "h2" | "h3" | "h4";
      return <Tag key={key} className={className}>{renderChildren(node.content)}</Tag>;
    }
    case "bulletList":
      return <ul key={key} className="list-disc space-y-1 pl-6 text-zinc-700">{renderChildren(node.content)}</ul>;
    case "orderedList":
      return <ol key={key} className="list-decimal space-y-1 pl-6 text-zinc-700">{renderChildren(node.content)}</ol>;
    case "listItem":
      return <li key={key} className="leading-7">{renderChildren(node.content)}</li>;
    case "blockquote":
      return (
        <blockquote key={key} className="border-l-4 border-zinc-200 pl-4 italic text-zinc-600">
          {renderChildren(node.content)}
        </blockquote>
      );
    case "codeBlock":
      return (
        <pre key={key} className="overflow-auto rounded-xl bg-zinc-950 p-4 text-sm leading-6 text-zinc-100">
          <code>{renderChildren(node.content)}</code>
        </pre>
      );
    case "horizontalRule":
      return <hr key={key} className="border-zinc-200" />;
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
