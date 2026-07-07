import type { OwnerRecipeCardDto } from "@/features/recipes/contracts";
import { defaultPreferredGravityUnit } from "@/features/system/gravity-units";

import { DemoExhibit } from "@/components/demo/demo-exhibit";
import { OwnerRecipeCard } from "@/components/recipes/owner-recipe-card";

/**
 * Секция 1 «Рецепты» (docs/demo-page.md §2.1). Карточки — настоящий
 * `OwnerRecipeCard` (тот же компонент, что на «Моих рецептах»), но это экспонаты:
 * ссылки внутри ведут в `/app/*` (аноним уедет на логин) и на несуществующие
 * публичные slug'и (404), а «Публичная страница» внутри карточки намеренно
 * пробивает pointer-events-auto — поэтому обёртка DemoExhibit (inert), а не
 * голый pointer-events-none. Заголовок секции рисует `page.tsx`.
 */
export function DemoRecipesSection({ recipes }: { recipes: OwnerRecipeCardDto[] }) {
  return (
    <div className="space-y-4">
      <DemoExhibit className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {recipes.map((recipe) => (
          <OwnerRecipeCard
            key={recipe.id}
            recipe={recipe}
            preferredGravityUnit={defaultPreferredGravityUnit}
            intent="preview"
          />
        ))}
      </DemoExhibit>

      <p className="text-sm text-muted-foreground">
        Плотность, горечь и цвет пересчитываются при каждой правке засыпи и сверяются с диапазоном стиля BJCP.
      </p>
    </div>
  );
}
