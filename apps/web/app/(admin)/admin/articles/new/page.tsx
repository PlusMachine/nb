import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { requireContentRole } from "@/features/content/permissions";
import { ArticleEditorForm } from "@/components/content/article-editor-form";

export default async function NewArticlePage() {
  const user = await requireContentRole("editor");

  return (
    <section className="space-y-5">
      <div>
        <Link href="/admin/articles" className="inline-flex items-center gap-1 text-sm text-muted-foreground transition hover:text-foreground">
          <ChevronLeft className="h-4 w-4" aria-hidden /> Все статьи
        </Link>
      </div>
      <h1 className="text-2xl font-semibold text-foreground">Новая статья</h1>
      <ArticleEditorForm
        capabilities={{
          canPublish: user.capabilities.canPublish,
          canFeatureOnHome: user.capabilities.canFeatureOnHome,
          canDelete: user.capabilities.canModerate
        }}
      />
    </section>
  );
}
