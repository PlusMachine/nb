const spaceRegex = /\s+/g;
const punctuationRegex = /[“”"'`´]/g;
const separatorsRegex = /[_,;:|/\\]+/g;

export const normalizeIngredientName = (value: string) => value
  .normalize("NFKC")
  .toLowerCase()
  .replace(punctuationRegex, "")
  .replace(separatorsRegex, " ")
  .replace(spaceRegex, " ")
  .trim();

export const normalizeAliasList = (aliases: string[]) => {
  const out = new Set<string>();
  for (const alias of aliases) {
    const normalized = normalizeIngredientName(alias);
    if (normalized) {
      out.add(normalized);
    }
  }
  return [...out];
};
