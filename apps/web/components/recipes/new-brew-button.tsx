import React from "react";
import Link from "next/link";
import { Timer } from "lucide-react";
import { buttonVariants } from "@nb/ui";

// =============================================================================
//  components/recipes/new-brew-button.tsx
//  Первичный вход «Сварить» с дашборда и страницы списка варок
//  (/app/brew-batches), где рецепта под рукой ещё нет. Ведёт в галерею «Мои
//  рецепты» в режиме выбора для варки (?intent=brew): полноценные карточки с
//  обложкой, стилем и бейджем «можно сварить», клик по карточке открывает общий
//  BrewPickerDialog. Так выбор рецепта происходит на настоящей поверхности с
//  фильтрами/сортировкой, а не в урезанном пикере-модалке.
// =============================================================================

export function NewBrewButton({ size = "md" }: { size?: "sm" | "md" }) {
  return (
    <Link href="/app/recipes?intent=brew" className={buttonVariants({ variant: "brand", size })}>
      <Timer className="h-4 w-4" aria-hidden />
      Сварить
    </Link>
  );
}
