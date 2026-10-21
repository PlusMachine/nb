import { sql, type SQLWrapper } from "@nb/db";

// The same NFKC/case/ё/separator rules as @nb/search. Translate whitespace
// explicitly so matching does not depend on the PostgreSQL regex locale.
const searchSeparators = ".,;:!?()[]{}\"“”«»'`´-_/\\|";
const searchWhitespace = "\t\n\v\f\r \u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff";
const translatedCharacters = searchSeparators + searchWhitespace;
const translatedSpaces = " ".repeat(translatedCharacters.length);

export const normalizeSearchSql = (column: SQLWrapper) => sql<string>`trim(regexp_replace(
  translate(replace(lower(normalize(coalesce(${column}, ''), NFKC)), 'ё', 'е'), ${translatedCharacters}, ${translatedSpaces}),
  ' +', ' ', 'g'
))`;

// ANY evaluates the normalized field once for the whole set of variants.
// Expanding normalization into every OR branch repeats Unicode/regexp work.
export const normalizedSearchMatch = (column: SQLWrapper, patterns: string[]) => (
  patterns.length === 0
    ? sql<boolean>`false`
    : sql<boolean>`${normalizeSearchSql(column)} ilike any(array[${sql.join(patterns.map((pattern) => sql`${pattern}`), sql`, `)}]::text[])`
);
