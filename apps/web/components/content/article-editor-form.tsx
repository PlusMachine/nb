"use client";

import React, { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Eye, Loader2, Save, Star, Trash2 } from "lucide-react";

import { Button } from "@nb/ui";
import { ContentBodyEditor } from "@/components/content/content-body-editor";
import { ConfirmActionDialog } from "@/components/shared/confirm-action-dialog";
import {
  createContentArticleAction,
  deleteContentArticleAction,
  setContentArticleFeaturedAction,
  setContentArticlePublicationAction,
  updateContentArticleAction
} from "@/app/(admin)/admin/articles/actions";
import {
  contentArticleStatusLabels,
  contentArticleTypes,
  contentArticleTypeLabels,
  type ContentArticleDto,
  type ContentArticleType,
  type TiptapDoc
} from "@/features/content-articles/contracts";

type Capabilities = { canPublish: boolean; canFeatureOnHome: boolean; canDelete: boolean };

const labelClass = "flex flex-col gap-1 text-sm";
const inputClass = "h-10 rounded-lg border border-zinc-200 px-3 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-400";

export function ArticleEditorForm({
  article,
  capabilities
}: {
  article?: ContentArticleDto;
  capabilities: Capabilities;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(article?.title ?? "");
  const [type, setType] = useState<ContentArticleType>(article?.type ?? "guide");
  const [excerpt, setExcerpt] = useState(article?.excerpt ?? "");
  const [coverImageUrl, setCoverImageUrl] = useState(article?.coverImageUrl ?? "");
  const [seoTitle, setSeoTitle] = useState(article?.seoTitle ?? "");
  const [seoDescription, setSeoDescription] = useState(article?.seoDescription ?? "");
  const bodyRef = useRef<TiptapDoc | null>(article?.bodyJson ?? null);

  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const inFlight = useRef(false);

  const buildPayload = () => ({
    title,
    type,
    excerpt: excerpt.trim() || null,
    bodyJson: bodyRef.current,
    coverImageUrl: coverImageUrl.trim() || null,
    seoTitle: seoTitle.trim() || null,
    seoDescription: seoDescription.trim() || null
  });

  const run = async (fn: () => Promise<{ ok: boolean; message: string }>, onOk?: () => void) => {
    if (inFlight.current) {
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setMessage(null);
    try {
      const result = await fn();
      setMessage({ ok: result.ok, text: result.message });
      if (result.ok) {
        onOk?.();
      }
    } catch {
      setMessage({ ok: false, text: "Не удалось выполнить операцию." });
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const handleSave = (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim()) {
      setMessage({ ok: false, text: "Введите заголовок." });
      return;
    }
    if (article) {
      void run(() => updateContentArticleAction(article.id, buildPayload()), () => router.refresh());
    } else {
      void run(async () => {
        const result = await createContentArticleAction(buildPayload());
        if (result.ok && result.articleId) {
          router.push(`/admin/articles/${result.articleId}/edit`);
        }
        return result;
      });
    }
  };

  const isPublished = article?.status === "published";

  return (
    <div className="space-y-6">
      <form onSubmit={handleSave} className="space-y-5 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="grid gap-4 sm:grid-cols-[1fr_12rem]">
          <label className={labelClass}>
            <span className="text-zinc-500">Заголовок</span>
            <input className={inputClass} value={title} onChange={(event) => setTitle(event.target.value)} maxLength={180} placeholder="Название гайда или обзора" />
          </label>
          <label className={labelClass}>
            <span className="text-zinc-500">Тип</span>
            <select className={inputClass} value={type} onChange={(event) => setType(event.target.value as ContentArticleType)}>
              {contentArticleTypes.map((value) => (
                <option key={value} value={value}>{contentArticleTypeLabels[value]}</option>
              ))}
            </select>
          </label>
        </div>

        <label className={labelClass}>
          <span className="text-zinc-500">Аннотация (необязательно — иначе соберём из текста)</span>
          <textarea className="min-h-[4rem] rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-400" value={excerpt} onChange={(event) => setExcerpt(event.target.value)} maxLength={500} />
        </label>

        <label className={labelClass}>
          <span className="text-zinc-500">URL обложки (необязательно)</span>
          <input className={inputClass} value={coverImageUrl} onChange={(event) => setCoverImageUrl(event.target.value)} placeholder="/images/... или https://..." />
        </label>

        <div className="space-y-1.5">
          <span className="text-sm text-zinc-500">Текст</span>
          <ContentBodyEditor initialDoc={article?.bodyJson ?? null} onChange={(doc) => { bodyRef.current = doc; }} />
        </div>

        <details className="rounded-lg border border-zinc-100 bg-zinc-50/60 p-3">
          <summary className="cursor-pointer text-sm font-medium text-zinc-700">SEO</summary>
          <div className="mt-3 space-y-3">
            <label className={labelClass}>
              <span className="text-zinc-500">SEO-заголовок</span>
              <input className={inputClass} value={seoTitle} onChange={(event) => setSeoTitle(event.target.value)} maxLength={255} />
            </label>
            <label className={labelClass}>
              <span className="text-zinc-500">SEO-описание</span>
              <textarea className="min-h-[3.5rem] rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-400" value={seoDescription} onChange={(event) => setSeoDescription(event.target.value)} maxLength={500} />
            </label>
          </div>
        </details>

        {message ? (
          <p role={message.ok ? "status" : "alert"} className={`text-sm ${message.ok ? "text-emerald-700" : "text-rose-600"}`}>
            {message.text}
          </p>
        ) : null}

        <div className="flex items-center gap-2">
          <Button type="submit" size="md" disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}
            {article ? "Сохранить" : "Создать черновик"}
          </Button>
        </div>
      </form>

      {article ? (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <span className="text-sm text-zinc-500">
            Статус: <span className="font-medium text-zinc-800">{contentArticleStatusLabels[article.status]}</span>
            {article.isFeatured ? <span className="ml-2 text-amber-600">· на главной</span> : null}
          </span>
          <div className="ml-auto flex flex-wrap gap-2">
            {isPublished ? (
              <Link href={`/guides/${article.slug}`} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-zinc-200 px-3 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50">
                <Eye className="h-4 w-4" aria-hidden /> Открыть
              </Link>
            ) : null}
            {capabilities.canPublish ? (
              <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => run(() => setContentArticlePublicationAction(article.id, !isPublished), () => router.refresh())}>
                {isPublished ? "Снять с публикации" : "Опубликовать"}
              </Button>
            ) : null}
            {capabilities.canFeatureOnHome ? (
              <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => run(() => setContentArticleFeaturedAction(article.id, !article.isFeatured), () => router.refresh())}>
                <Star className={`h-4 w-4 ${article.isFeatured ? "fill-amber-400 text-amber-500" : ""}`} aria-hidden />
                {article.isFeatured ? "Убрать с главной" : "На главную"}
              </Button>
            ) : null}
            {capabilities.canDelete ? (
              <Button type="button" variant="dangerOutline" size="sm" disabled={busy} onClick={() => setDeleteDialogOpen(true)}>
                <Trash2 className="h-4 w-4" aria-hidden /> Удалить
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      {article && capabilities.canDelete ? (
        <ConfirmActionDialog
          open={deleteDialogOpen}
          title="Удалить статью?"
          description="Статья будет удалена без возможности восстановления."
          confirmLabel="Удалить статью"
          pending={busy}
          error={message && !message.ok ? message.text : null}
          onClose={() => setDeleteDialogOpen(false)}
          onConfirm={() => {
            void run(
              () => deleteContentArticleAction(article.id),
              () => {
                setDeleteDialogOpen(false);
                router.push("/admin/articles");
              }
            );
          }}
        />
      ) : null}
    </div>
  );
}
