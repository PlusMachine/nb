"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";

import { cloneRecipeAction } from "@/app/(app)/app/recipes/actions";

export function CloneRecipeButton({ 
  recipeId, 
  renderTrigger 
}: { 
  recipeId: string;
  renderTrigger?: (onClick: () => void, isPending: boolean) => React.ReactNode;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  const handleClick = async () => {
    setPending(true);
    const result = await cloneRecipeAction(recipeId);
    setPending(false);
    if (result.ok && result.recipe) {
      router.push(`/app/recipes/${result.recipe.id}/edit`);
    }
  };

  const defaultTrigger = (
    <button
      type="button"
      disabled={pending}
      onClick={handleClick}
      className="text-sm font-medium text-foreground hover:text-foreground disabled:opacity-60"
    >
      {pending ? "Клонируем..." : "Клонировать"}
    </button>
  );

  return renderTrigger ? renderTrigger(handleClick, pending) : defaultTrigger;
}
