import type { TiptapDoc, TiptapNode } from "./contracts";

const WORDS_PER_MINUTE = 180;

const countWordsInNode = (node: TiptapNode | null | undefined): number => {
  if (!node || typeof node !== "object") {
    return 0;
  }
  let words = 0;
  if (typeof node.text === "string" && node.text.trim()) {
    words += node.text.trim().split(/\s+/).length;
  }
  if (Array.isArray(node.content)) {
    for (const child of node.content) {
      words += countWordsInNode(child);
    }
  }
  return words;
};

/** Оценка времени чтения Tiptap-документа в минутах (минимум 1). */
export const estimateReadingMinutes = (doc: TiptapDoc | null | undefined): number => {
  if (!doc || !Array.isArray(doc.content)) {
    return 1;
  }
  const words = doc.content.reduce((sum, node) => sum + countWordsInNode(node), 0);
  return Math.max(1, Math.ceil(words / WORDS_PER_MINUTE));
};

/** Плоский текст документа (для excerpt-фолбэка и SEO-описания). */
export const extractPlainText = (doc: TiptapDoc | null | undefined, limit = 320): string => {
  if (!doc || !Array.isArray(doc.content)) {
    return "";
  }
  const parts: string[] = [];
  const walk = (node: TiptapNode | null | undefined) => {
    if (!node || typeof node !== "object") {
      return;
    }
    if (typeof node.text === "string") {
      parts.push(node.text);
    }
    if (Array.isArray(node.content)) {
      node.content.forEach(walk);
    }
  };
  doc.content.forEach(walk);
  const text = parts.join(" ").replace(/\s+/g, " ").trim();
  return text.length > limit ? `${text.slice(0, limit).trimEnd()}…` : text;
};
