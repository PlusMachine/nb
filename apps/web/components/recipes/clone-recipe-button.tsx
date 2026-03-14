"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";

import { cloneRecipeAction } from "@/app/(app)/app/recipes/actions";

export function CloneRecipeButton({ recipeId }: { recipeId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  return (
    <button
      type="button"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        const result = await cloneRecipeAction(recipeId);
        setPending(false);
        if (result.ok && result.recipe) {
          router.push(`/app/recipes/${result.recipe.id}/edit`);
        }
      }}
      className="text-sm font-medium text-zinc-700 hover:text-zinc-900 disabled:opacity-60"
    >
      {pending ? "Клонируем..." : "Клонировать"}
    </button>
  );
}
