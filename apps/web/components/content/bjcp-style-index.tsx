import Link from "next/link";
import type { BjcpCatalogData } from "@nb/content";

import { getCategoryPreviewStyles } from "@/features/content/bjcp-catalog";

type Props = {
  catalog: BjcpCatalogData;
};

/**
 * Серверный (без "use client") полный указатель всех стилей BJCP.
 * Не зависит от клиентского состояния каталога (`?view=`, раскрытые категории
 * и т.п.) — гарантирует, что краулер видит ссылку на каждый стиль в HTML
 * дефолтного /bjcp, даже когда клиентский каталог рендерит только часть (A8).
 */
export function BjcpStyleIndex({ catalog }: Props) {
  const categoriesWithStyles = catalog.categories
    .map((category) => ({
      category,
      styles: getCategoryPreviewStyles(catalog, category.id)
    }))
    .filter((group) => group.styles.length > 0);

  if (!categoriesWithStyles.length) {
    return null;
  }

  return (
    <section className="mt-16 space-y-6 border-t border-border pt-10">
      <h2 className="text-2xl font-semibold text-foreground" style={{ fontFamily: "var(--font-display)" }}>
        Указатель стилей
      </h2>

      <div className="columns-1 gap-x-10 sm:columns-2 xl:columns-3">
        {categoriesWithStyles.map(({ category, styles }) => (
          <div key={category.id} className="mb-8 break-inside-avoid">
            <h3 className="mb-2 text-sm font-semibold text-foreground">
              {category.id}. {category.nameRu}
            </h3>
            <ul>
              {styles.map((style) => (
                <li key={style.slug} className="text-sm">
                  {/* py-2 вместо голого leading-6: тап-зона ссылки в списке ~120
                      элементов была ~24px, теперь ближе к комфортным 40px. */}
                  <Link href={`/bjcp/${style.slug}`} className="block py-2 leading-5 text-muted-foreground transition hover:text-foreground">
                    {style.bjcpId} · {style.title}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
