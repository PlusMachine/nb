import type { Metadata } from "next";
import { permanentRedirect } from "next/navigation";

import { IngredientCatalogContent, parseCategory, parsePage, parseSort, parseSubtype, parseView } from "./content";
import { buildCatalogListMetadata, resolveCatalogLandingForFilter } from "@/features/ingredients/seo";

type Props = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const q = typeof resolvedSearchParams.q === "string" ? resolvedSearchParams.q : undefined;
  const view = typeof resolvedSearchParams.view === "string" ? resolvedSearchParams.view : undefined;
  const page = parsePage(typeof resolvedSearchParams.page === "string" ? resolvedSearchParams.page : undefined);

  // Легаси category/subtype и пагинация уходят permanentRedirect'ом раньше рендера
  // (см. дефолтный экспорт ниже) — сюда долетают только параметры самого хаба.
  return buildCatalogListMetadata({ q, view, page });
}

// Собирает query-строку легаси-редиректа только из непустых/нестандартных
// значений — молчаливо не тащит дефолты (view=all, sort=name, page=1) в URL.
const buildRedirectSearch = (parts: Array<[string, string | undefined]>) => {
  const search = new URLSearchParams();
  for (const [key, value] of parts) {
    if (value) {
      search.set(key, value);
    }
  }

  const query = search.toString();
  return query ? `?${query}` : "";
};

export default async function IngredientCatalogPage({ searchParams }: Props) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const rawCategory = typeof resolvedSearchParams.category === "string" ? resolvedSearchParams.category : undefined;
  const rawSubtype = typeof resolvedSearchParams.subtype === "string" ? resolvedSearchParams.subtype : undefined;
  const q = String(resolvedSearchParams.q ?? "").trim();
  const view = parseView(typeof resolvedSearchParams.view === "string" ? resolvedSearchParams.view : undefined);
  const sort = parseSort(typeof resolvedSearchParams.sort === "string" ? resolvedSearchParams.sort : undefined);
  const page = parsePage(typeof resolvedSearchParams.page === "string" ? resolvedSearchParams.page : undefined);

  // Легаси плоский фильтр (?category=/&subtype=) — раньше это были query-параметры
  // хаба, теперь категории живут на собственных лендингах /catalog/{slug}.
  if (rawCategory !== undefined || rawSubtype !== undefined) {
    const landing = resolveCatalogLandingForFilter(parseCategory(rawCategory), parseSubtype(rawSubtype));

    if (landing) {
      permanentRedirect(`/catalog/${landing.slug}${buildRedirectSearch([
        ["q", q || undefined],
        ["view", view !== "all" ? view : undefined],
        ["sort", sort !== "name" ? sort : undefined],
        ["page", page > 1 ? String(page) : undefined]
      ])}`);
    }

    // Фильтр без своего лендинга (например category=fermentable без subtype —
    // malt/fermentable неоднозначны) на хабе больше не поддерживается точечно —
    // сворачиваем на сам хаб, sort/page у него нет смысла сохранять.
    permanentRedirect(`/catalog${buildRedirectSearch([
      ["q", q || undefined],
      ["view", view !== "all" ? view : undefined]
    ])}`);
  }

  // У хаба нет пагинации — легаси ?page=N без category сворачивается на первую страницу.
  if (page > 1) {
    permanentRedirect(`/catalog${buildRedirectSearch([
      ["q", q || undefined],
      ["view", view !== "all" ? view : undefined]
    ])}`);
  }

  return <IngredientCatalogContent searchParams={searchParams} />;
}
