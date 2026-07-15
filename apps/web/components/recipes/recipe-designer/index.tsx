// Публичный API recipe-designer/*. Внешние импорты `@/components/recipes/recipe-designer`
// (в т.ч. из тестов) продолжают работать без правок — модуль стал директорией
// в рамках механической декомпозиции (этап 6a), реэкспорт держит прежний фасад.
export { RecipeDesigner, type RecipeSaveStatus } from "./recipe-designer";

export {
  buildRecipeEditHref,
  buildRecipeWizardResumeHref,
  buildRecipeEditorResumeHref,
  buildRecipeDeleteConfirmDescription,
  createEmptyIngredient,
  applyHopUseTypeChange,
  isAutoRecipeTitle,
  isRecipeDraftWorthPersisting,
  resolveRecipeIngredientSearchType,
  resolveRecipeIngredientEditorSourceMode,
  resolveRecipeFermentablePickerScopeContext,
  resolveRecipeIngredientForcedGroup,
  shouldAutoFocusRecipeIngredientPicker,
  mapRecipeConsumableUsageStage,
  resolveRecipeConsumableStageOptions,
  resolveRecipeConsumableDefaultStage,
  recipeConsumableAdditiveGroup,
  recipeConsumableSubtypeOptions,
  buildRecipeStockIngredientSearchParams,
  filterRecipeWaterAddFlowSuggestions,
  resolveRecipeWaterManualSaltAdditionFromIngredient,
  applyRecipeWaterAddFlowSaltToWaterPlan,
  shouldShowRescaleToVolumeAction,
  buildDesignerScaleInput,
  resolveInitialEquipmentState,
  buildStatsDivergence,
  RECIPE_STATS_DIVERGENCE_TOLERANCE,
  type RecipeFermentablePickerScope,
  type InitialEquipmentState,
  type RecipeStatsForDivergence
} from "./helpers";
