import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { middleware } from "../middleware";

// Заголовок x-pathname читает requireUser, чтобы после /login?next=... вернуть
// анонима туда же, откуда он пришёл, — включая query (например ?style=...).
const readXPathname = (request: NextRequest) => {
  const response = middleware(request);
  return response.headers.get("x-middleware-request-x-pathname");
};

describe("middleware", () => {
  it("прокидывает путь вместе с query-строкой", () => {
    const request = new NextRequest("http://localhost/app/recipes/new?style=bjcp-24a");
    expect(readXPathname(request)).toBe("/app/recipes/new?style=bjcp-24a");
  });

  it("не добавляет лишний ? для пути без query", () => {
    const request = new NextRequest("http://localhost/app/recipes/new");
    expect(readXPathname(request)).toBe("/app/recipes/new");
  });
});
