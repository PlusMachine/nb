"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useTransition } from "react";

import { mergeRecipeQuery } from "@/features/recipes/recipes-url";

type QueryPatch = Record<string, string | null>;
type MergeOpts = { resetPage?: boolean };

/**
 * Общая навигация для URL-driven контролов витрины. Читает живой `searchParams`,
 * мержит патч через {@link mergeRecipeQuery} и обновляет URL (push/replace) в
 * `startTransition`, чтобы Suspense-граница `recipes-results` показывала скелетон.
 */
export const useRecipeQueryNav = () => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const buildHref = useCallback(
    (patch: QueryPatch, opts?: MergeOpts) => {
      const query = mergeRecipeQuery(new URLSearchParams(searchParams.toString()), patch, opts);
      return query ? `${pathname}?${query}` : pathname;
    },
    [pathname, searchParams]
  );

  const navigate = useCallback(
    (patch: QueryPatch, opts?: MergeOpts, mode: "push" | "replace" = "push") => {
      const href = buildHref(patch, opts);
      startTransition(() => {
        if (mode === "replace") {
          router.replace(href, { scroll: false });
        } else {
          router.push(href, { scroll: false });
        }
      });
    },
    [buildHref, router]
  );

  const reset = useCallback(() => {
    startTransition(() => {
      router.push(pathname, { scroll: false });
    });
  }, [pathname, router]);

  return { searchParams, isPending, buildHref, navigate, reset };
};
