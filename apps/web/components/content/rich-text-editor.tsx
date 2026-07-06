"use client";

import { useEffect, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";

const buttonClassName = "rounded-full border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground transition hover:border-border hover:bg-muted";

const initialContent = {
  type: "doc",
  content: [
    {
      type: "heading",
      attrs: { level: 2 },
      content: [{ type: "text", text: "Вводный абзац для обзора или статьи" }]
    },
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "Этот редактор поднят как foundation для будущей админки статей. Сейчас он позволяет собрать body в JSON-формате и позже сохранить его в БД без привязки к BJCP-структуре."
        }
      ]
    },
    {
      type: "bulletList",
      content: [
        {
          type: "listItem",
          content: [{ type: "paragraph", content: [{ type: "text", text: "Подходит для обзоров оборудования и обычных статей" }] }]
        },
        {
          type: "listItem",
          content: [{ type: "paragraph", content: [{ type: "text", text: "BJCP-стили лучше хранить в structured fields и рендерить шаблоном" }] }]
        }
      ]
    }
  ]
};

export function RichTextEditor() {
  const [json, setJson] = useState(JSON.stringify(initialContent, null, 2));

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3, 4] }
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          rel: "noopener noreferrer nofollow",
          class: "text-link underline underline-offset-4"
        }
      }),
      Placeholder.configure({
        placeholder: "Напишите вступление, обзор или аналитическую статью..."
      })
    ],
    content: initialContent,
    editorProps: {
      attributes: {
        class: "min-h-[18rem] rounded-[1.5rem] border border-border bg-card px-5 py-4 text-[1rem] leading-8 text-foreground focus:outline-none"
      }
    },
    immediatelyRender: false,
    onUpdate({ editor: current }) {
      setJson(JSON.stringify(current.getJSON(), null, 2));
    }
  });

  useEffect(() => {
    if (!editor) {
      return;
    }

    setJson(JSON.stringify(editor.getJSON(), null, 2));
  }, [editor]);

  if (!editor) {
    return null;
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
      <section className="space-y-4 rounded-[2rem] border border-border bg-muted/80 p-5">
        <div className="flex flex-wrap gap-2">
          <button type="button" className={buttonClassName} onClick={() => editor.chain().focus().toggleBold().run()}>
            Bold
          </button>
          <button type="button" className={buttonClassName} onClick={() => editor.chain().focus().toggleItalic().run()}>
            Italic
          </button>
          <button type="button" className={buttonClassName} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
            H2
          </button>
          <button type="button" className={buttonClassName} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
            H3
          </button>
          <button type="button" className={buttonClassName} onClick={() => editor.chain().focus().toggleBulletList().run()}>
            Список
          </button>
          <button
            type="button"
            className={buttonClassName}
            onClick={() => {
              const url = window.prompt("URL ссылки");
              if (!url) {
                return;
              }

              editor.chain().focus().setLink({ href: url }).run();
            }}
          >
            Ссылка
          </button>
        </div>
        <EditorContent editor={editor} />
      </section>

      <section className="rounded-[2rem] border border-border bg-card p-5 shadow-sm">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">JSON body</p>
        <pre className="mt-4 max-h-[34rem] overflow-auto rounded-[1.25rem] bg-foreground p-4 text-xs leading-6 text-background">
          {json}
        </pre>
      </section>
    </div>
  );
}
