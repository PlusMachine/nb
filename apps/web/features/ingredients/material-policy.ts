/** Reference methods describe a process; quantities belong to physical materials. */
const record = (value: unknown): Record<string, unknown> => (
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
);

export const isPhysicalIngredient = (source: {
  inventoryEnabled?: boolean;
  itemKind?: string | null;
  attributes?: unknown;
  properties?: unknown;
  technicalData?: unknown;
}) => {
  const attributes = record(source.attributes);
  const properties = record(source.properties);
  const technical = record(source.technicalData ?? properties.technicalData);
  return source.inventoryEnabled !== false
    && properties.inventoryEnabled !== false
    && source.itemKind !== "method"
    && properties.itemKind !== "method"
    && attributes.calculation_support !== "not_an_additive"
    && technical.calculationSupport !== "not_an_additive";
};

export const derivedCatalogIngredientId = (source: { properties?: unknown }) => {
  const value = record(source.properties).derivedFromIngredientId;
  return typeof value === "string" && value.trim() ? value : null;
};
