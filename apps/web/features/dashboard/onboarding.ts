// Первый вход без собственных данных. История партий учитывается отдельно от
// активных варок: завершивший первую варку не должен снова попасть в знакомство
// после очистки рецептов и склада.

export type DashboardOnboardingInput = {
  recipeCount: number;
  inventoryTotalItems: number;
  activeBrewCount: number;
  brewBatchCount: number;
};

export const isNewUserDashboard = ({
  recipeCount,
  inventoryTotalItems,
  activeBrewCount,
  brewBatchCount
}: DashboardOnboardingInput): boolean => (
  recipeCount === 0 && inventoryTotalItems === 0 && activeBrewCount === 0 && brewBatchCount === 0
);
