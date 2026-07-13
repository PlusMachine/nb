"use client";

import { useEffect, useMemo, useRef } from "react";
import { EditorContent, NodeViewWrapper, ReactNodeViewRenderer, useEditor, type NodeViewProps } from "@tiptap/react";
import Placeholder from "@tiptap/extension-placeholder";
import { Image as ImageIcon, LayoutPanelTop } from "lucide-react";

import { contentEditorExtensions, toPlainTiptapDoc } from "@/features/content-articles/tiptap-schema";
import type { TiptapDoc } from "@/features/content-articles/contracts";

const buttonClassName = "rounded-full border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground transition hover:border-border hover:bg-muted";

const emptyDoc: TiptapDoc = { type: "doc", content: [{ type: "paragraph" }] };

const atomClassName = (selected: boolean) =>
  `my-3 flex items-center gap-3 rounded-2xl border-2 border-dashed px-4 py-3 ${
    selected ? "border-ring bg-accent" : "border-border bg-muted"
  }`;

/** Иллюстрация: атомарный блок — показываем фото или слот с описанием кадра. */
function FigureNodeView({ node, selected }: NodeViewProps) {
  const src = typeof node.attrs.src === "string" ? node.attrs.src : null;
  const caption = typeof node.attrs.caption === "string" ? node.attrs.caption : null;
  const hint = typeof node.attrs.hint === "string" ? node.attrs.hint : null;

  return (
    <NodeViewWrapper className={atomClassName(selected)} data-drag-handle>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={caption ?? ""} className="h-16 w-24 shrink-0 rounded-lg border border-border object-cover" />
      ) : (
        <span className="flex h-16 w-24 shrink-0 items-center justify-center rounded-lg border border-border bg-card">
          <ImageIcon className="h-5 w-5 text-muted-foreground" aria-hidden />
        </span>
      )}
      <span className="min-w-0 space-y-0.5">
        <span className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {src ? "Фото" : "Фото — слот"}
        </span>
        <span className="block truncate text-sm text-foreground">{caption ?? hint ?? "Без подписи"}</span>
      </span>
    </NodeViewWrapper>
  );
}

/** Интерактивная вставка: в теле хранится только имя виджета. */
function WidgetNodeView({ node, selected }: NodeViewProps) {
  const name = typeof node.attrs.name === "string" ? node.attrs.name : "—";

  return (
    <NodeViewWrapper className={atomClassName(selected)} data-drag-handle>
      <span className="flex h-16 w-24 shrink-0 items-center justify-center rounded-lg border border-border bg-card">
        <LayoutPanelTop className="h-5 w-5 text-muted-foreground" aria-hidden />
      </span>
      <span className="min-w-0 space-y-0.5">
        <span className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Вставка</span>
        <span className="block truncate font-mono text-sm text-foreground">{name}</span>
      </span>
    </NodeViewWrapper>
  );
}

// Контролируемый Tiptap-редактор тела статьи: отдаёт ProseMirror JSON через
// onChange. Схема — общая с публичным рендером (features/content-articles/tiptap-schema).
export function ContentBodyEditor({
  initialDoc,
  onChange,
  onContentError
}: {
  initialDoc: TiptapDoc | null;
  onChange: (doc: TiptapDoc) => void;
  onContentError?: () => void;
}) {
  // Контент не разобрался (в теле узел, которого нет в схеме): Tiptap подменяет
  // документ пустым. Такой документ наружу не отдаём — иначе «Сохранить» затрёт
  // текст статьи пустотой.
  const brokenRef = useRef(false);

  const extensions = useMemo(
    () => [
      ...contentEditorExtensions({
        figure: () => ReactNodeViewRenderer(FigureNodeView),
        widget: () => ReactNodeViewRenderer(WidgetNodeView)
      }),
      Placeholder.configure({ placeholder: "Напишите гайд или обзор…" })
    ],
    []
  );

  const editor = useEditor({
    extensions,
    content: initialDoc ?? emptyDoc,
    enableContentCheck: true,
    onContentError() {
      brokenRef.current = true;
      onContentError?.();
    },
    editorProps: {
      attributes: {
        class: "min-h-[20rem] rounded-2xl border border-border bg-card px-5 py-4 text-[1rem] leading-8 text-foreground focus:outline-none"
      }
    },
    immediatelyRender: false,
    onUpdate({ editor: current }) {
      if (brokenRef.current) {
        return;
      }
      onChange(toPlainTiptapDoc(current.getJSON()));
    }
  });

  // Передаём начальный документ родителю один раз (чтобы submit без правок body
  // сохранил текущее содержимое, а не null).
  useEffect(() => {
    if (!editor) {
      return;
    }
    if (brokenRef.current) {
      // Правки в подменённом документе бессмысленны и опасны — запрещаем ввод.
      editor.setEditable(false);
      return;
    }
    onChange(toPlainTiptapDoc(editor.getJSON()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  if (!editor) {
    return <div className="min-h-[20rem] rounded-2xl border border-border bg-muted" aria-hidden />;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <button type="button" className={buttonClassName} onClick={() => editor.chain().focus().toggleBold().run()}>Bold</button>
        <button type="button" className={buttonClassName} onClick={() => editor.chain().focus().toggleItalic().run()}>Italic</button>
        <button type="button" className={buttonClassName} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>H2</button>
        <button type="button" className={buttonClassName} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>H3</button>
        <button type="button" className={buttonClassName} onClick={() => editor.chain().focus().toggleBulletList().run()}>Список</button>
        <button type="button" className={buttonClassName} onClick={() => editor.chain().focus().toggleBlockquote().run()}>Цитата</button>
        <button
          type="button"
          className={buttonClassName}
          onClick={() => {
            const url = window.prompt("URL ссылки");
            if (url) {
              editor.chain().focus().setLink({ href: url }).run();
            }
          }}
        >
          Ссылка
        </button>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
