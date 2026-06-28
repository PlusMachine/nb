"use client";

import { useEffect } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";

import type { TiptapDoc } from "@/features/content-articles/contracts";

const buttonClassName = "rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 transition hover:border-zinc-300 hover:bg-zinc-50";

const emptyDoc: TiptapDoc = { type: "doc", content: [{ type: "paragraph" }] };

// Контролируемый Tiptap-редактор тела статьи: отдаёт ProseMirror JSON через
// onChange. Переиспользует те же расширения, что и публичный рендер
// (components/content/tiptap-content.tsx) — StarterKit (heading 2-4) + link.
export function ContentBodyEditor({
  initialDoc,
  onChange
}: {
  initialDoc: TiptapDoc | null;
  onChange: (doc: TiptapDoc) => void;
}) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3, 4] } }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { rel: "noopener noreferrer nofollow", class: "text-sky-700 underline underline-offset-4" }
      }),
      Placeholder.configure({ placeholder: "Напишите гайд или обзор…" })
    ],
    content: initialDoc ?? emptyDoc,
    editorProps: {
      attributes: {
        class: "min-h-[20rem] rounded-2xl border border-zinc-200 bg-white px-5 py-4 text-[1rem] leading-8 text-zinc-800 focus:outline-none"
      }
    },
    immediatelyRender: false,
    onUpdate({ editor: current }) {
      onChange(current.getJSON() as TiptapDoc);
    }
  });

  // Передаём начальный документ родителю один раз (чтобы submit без правок body
  // сохранил текущее содержимое, а не null).
  useEffect(() => {
    if (editor) {
      onChange(editor.getJSON() as TiptapDoc);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  if (!editor) {
    return <div className="min-h-[20rem] rounded-2xl border border-zinc-200 bg-zinc-50" aria-hidden />;
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
