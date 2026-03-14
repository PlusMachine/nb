"use client";

import React from "react";

import type { RecipeDetailDto } from "@/features/recipes/contracts";

import { RecipeDesigner } from "./recipe-designer";

type Props = {
  mode: "create" | "edit";
  initialRecipe?: RecipeDetailDto;
};

export function RecipeForm({ mode, initialRecipe }: Props) {
  return <RecipeDesigner mode={mode} initialRecipe={initialRecipe} />;
}
