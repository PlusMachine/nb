import { describe, expect, it } from "vitest";
import { sql } from "@nb/db";

import { normalizeSearchSql } from "../lib/search-sql";

describe("SQL search normalization", () => {
  it("binds text as values and composes with parameterized LIKE patterns", () => {
    const value = "Мёд'; drop table recipes; --";
    const expression = normalizeSearchSql(sql`${value}`);
    // Inspect parameters through Drizzle's own renderer, without a DB connection.
    const query = expression.toQuery({
      casing: { getColumnCasing: () => "" } as never,
      escapeName: (name) => `"${name}"`,
      escapeParam: (index) => `$${index + 1}`,
      escapeString: (text) => `'${text.replaceAll("'", "''")}'`
    });
    expect(query.sql).toContain("normalize(coalesce($1, ''), NFKC)");
    expect(query.sql).not.toContain(value);
    expect(query.params[0]).toBe(value);
    expect(query.params[1]).toContain("\\");
    expect(query.params[1]).toContain("\ufeff");
    expect(query.params[2]).toMatch(/^ +$/);
  });
});
