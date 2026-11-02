type JsonRecord = Record<string, unknown>;
const record = (value: unknown): JsonRecord => (
  value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {}
);
const stable = (value: unknown): unknown => Array.isArray(value) ? value.map(stable)
  : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,entry])=>[key,stable(entry)])) : value;
const equal = (left: unknown, right: unknown) => JSON.stringify(stable(left)) === JSON.stringify(stable(right));

export type CatalogSeedConflict = { ingredientId: string; field: string; current: unknown; incoming: unknown };

/** Field ownership stays with the existing catalog row, alongside its source baseline. */
export const reconcileCatalogSeed = (
  incoming: JsonRecord,
  current?: JsonRecord | null
): { values: JsonRecord; conflicts: CatalogSeedConflict[] } => {
  const sourceAttributes = record(incoming.attributes);
  const currentAttributes = record(current?.attributes);
  const previous = record(currentAttributes._seed_snapshot);
  const previousAttributes = record(previous.attributes);
  const approvedPrevious = record(sourceAttributes._seed_previous);
  const overrides = new Set(Array.isArray(currentAttributes._seed_overrides)
    ? currentAttributes._seed_overrides.filter((value): value is string => typeof value === "string") : []);
  const conflicts: CatalogSeedConflict[] = [];
  const values = { ...incoming };
  const retain = (field: string, oldValue: unknown, nextValue: unknown, baseline: unknown, hasBaseline: boolean) => {
    const approvedBaseline = field in approvedPrevious;
    const knownBaseline = hasBaseline || approvedBaseline;
    const prior = hasBaseline ? baseline : approvedPrevious[field];
    const legacyConflict = !knownBaseline && oldValue !== undefined && !equal(oldValue,nextValue);
    if (overrides.has(field) || legacyConflict || (knownBaseline && !equal(oldValue, prior))) {
      if (!equal(oldValue, nextValue)) conflicts.push({ ingredientId: String(incoming.id), field, current: oldValue, incoming: nextValue });
      return oldValue;
    }
    return nextValue;
  };
  if (current) {
    for (const key of Object.keys(incoming)) {
      if (key === "attributes" || key === "id" || key === "isActive") continue;
      values[key] = retain(key, current[key], incoming[key], previous[key], key in previous);
    }
    // Importing a new baseline must never republish an editor's archive/merge/draft.
    if (current.isActive === false) values.isActive = false;
  }
  const attributes: JsonRecord = { ...currentAttributes, ...sourceAttributes };
  for (const key of new Set([...Object.keys(previousAttributes), ...Object.keys(sourceAttributes)])) {
    if (key.startsWith("_")) continue;
    const next = key in sourceAttributes ? sourceAttributes[key] : undefined;
    const value = current
      ? retain(`attributes.${key}`, currentAttributes[key], next, previousAttributes[key], key in previousAttributes)
      : next;
    if (value === undefined) delete attributes[key]; else attributes[key] = value;
  }
  for (const [key, value] of Object.entries(currentAttributes)) {
    if (key.startsWith("_") && key !== "_seed_snapshot") attributes[key] = value;
  }
  // A source-confirmed merge is an operational correction, never a reactivation.
  if (sourceAttributes._catalog_status === "merged") {
    attributes._catalog_status = "merged";
    attributes._merged_into_id = sourceAttributes._merged_into_id;
    values.isActive = false;
  }
  const { attributes: _attributes, ...sourceFields } = incoming;
  attributes._seed_snapshot = { ...sourceFields, attributes: sourceAttributes };
  values.attributes = attributes;
  return { values, conflicts };
};

/** Remember only values actually changed by an editor, rather than freezing a whole row. */
export const markCatalogEditorialOverrides = (current: JsonRecord, next: JsonRecord): JsonRecord => {
  const attributes = record(next.attributes);
  const oldAttributes = record(current.attributes);
  const overrides = new Set(Array.isArray(oldAttributes._seed_overrides)
    ? oldAttributes._seed_overrides.filter((value): value is string => typeof value === "string") : []);
  for (const [key, value] of Object.entries(next)) {
    if (["id", "attributes", "updatedAt", "createdAt", "aliases", "sources", "packageVariants"].includes(key)) continue;
    if (!equal(current[key], value)) overrides.add(key);
  }
  for (const key of new Set([...Object.keys(oldAttributes), ...Object.keys(attributes)])) {
    if (!key.startsWith("_") && !equal(oldAttributes[key], attributes[key])) overrides.add(`attributes.${key}`);
  }
  return { ...oldAttributes, ...attributes, _seed_overrides: [...overrides] };
};
