import { RichTextEditor } from "@/components/content/rich-text-editor";
import { requireContentRole } from "@/features/content/permissions";

export default async function AdminArticleEditorPage() {
  const user = await requireContentRole("editor");

  return (
    <section className="space-y-5">
      <header className="rounded-[2rem] border border-zinc-200 bg-white p-6 shadow-sm">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-400">Tiptap foundation</p>
        <h1 className="mt-2 text-3xl font-semibold text-zinc-950">Редактор статьи</h1>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-zinc-600">
          Этот экран пока работает как редакторская лаборатория: body формируется в Tiptap JSON и готов к следующему
          этапу, когда вы захотите сохранять обзоры и обычные статьи в БД через админку.
        </p>
        <p className="text-sm leading-7 text-zinc-500">
          Текущая роль: <span className="font-semibold text-zinc-950">{user.role}</span>. Публикация и вывод на
          главную дальше будут доступны через `moderator/admin`.
        </p>
      </header>
      <RichTextEditor />
    </section>
  );
}
