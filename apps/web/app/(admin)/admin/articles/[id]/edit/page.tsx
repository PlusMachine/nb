import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { requireContentRole } from "@/features/content/permissions";
import { getContentArticleForEditor } from "@/features/content-articles/service";
import { ArticleEditorForm } from "@/components/content/article-editor-form";

export default async function EditArticlePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireContentRole("editor");
  const { id } = await params;

  const article = await getContentArticleForEditor({ id: user.id, role: user.role }, id);
  if (!article) {
    notFound();
  }

  const canDelete = article.authorId === user.id || user.capabilities.canModerate;

  return (
    <section className="space-y-5">
      <div>
        <Link href="/admin/articles" className="inline-flex items-center gap-1 text-sm text-muted-foreground transition hover:text-foreground">
          <ChevronLeft className="h-4 w-4" aria-hidden /> Все статьи
        </Link>
      </div>
      <h1 className="text-2xl font-semibold text-foreground">Редактирование</h1>
      <ArticleEditorForm
        article={article}
        capabilities={{
          canPublish: user.capabilities.canPublish,
          canFeatureOnHome: user.capabilities.canFeatureOnHome,
          canDelete
        }}
      />
    </section>
  );
}
