// Чистая логика «день-1» дашборда: пользователь без единого рецепта, позиции
// склада и активной варки ещё не прошёл первый круг каталог→склад→рецепт,
// поэтому вместо «С возвращением» и стат-сетки с нулями показываем явный
// порядок первого пути. Вынесено из page.tsx, чтобы покрывать тестом без
// рендера всей страницы.

export type DashboardOnboardingInput = {
  recipeCount: number;
  inventoryTotalItems: number;
  activeBrewCount: number;
};

export const isNewUserDashboard = ({
  recipeCount,
  inventoryTotalItems,
  activeBrewCount
}: DashboardOnboardingInput): boolean => (
  recipeCount === 0 && inventoryTotalItems === 0 && activeBrewCount === 0
);
