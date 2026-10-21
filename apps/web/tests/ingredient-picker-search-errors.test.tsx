import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  defaultSearchIngredients,
  IngredientPickerSearchErrorState,
  IngredientSearchRequestError,
  resolveIngredientPickerSearchError
} from "../components/ingredients/ingredient-picker";

const params = () => ({ q: "citra", limit: 10, signal: new AbortController().signal });

describe("ingredient picker search failures", () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each([429, 500, 503])("rejects HTTP %s instead of returning a cacheable empty result", async (status) => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("private server details", { status })));
    await expect(defaultSearchIngredients(params())).rejects.toMatchObject({ status });
  });

  it("makes a new request after a failed attempt and accepts its successful result", async () => {
    const result = { items: [{ id: "citra" }], total: 1 };
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response("", { status: 429 }))
      .mockResolvedValueOnce(Response.json(result));
    vi.stubGlobal("fetch", fetch);
    await expect(defaultSearchIngredients(params())).rejects.toBeInstanceOf(IngredientSearchRequestError);
    await expect(defaultSearchIngredients(params())).resolves.toEqual(result);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("preserves a genuinely empty successful response", async () => {
    const result = { items: [], total: 0 };
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(result)));
    await expect(defaultSearchIngredients(params())).resolves.toEqual(result);
  });

  it("preserves cancellation for the effect to ignore instead of turning it into an empty result", async () => {
    const error = new DOMException("cancelled", "AbortError");
    vi.stubGlobal("fetch", vi.fn(async () => { throw error; }));
    await expect(defaultSearchIngredients(params())).rejects.toBe(error);
  });

  it("shows a local retry action and a specific rate-limit message without server details", () => {
    const message = resolveIngredientPickerSearchError(new IngredientSearchRequestError(429));
    const html = renderToStaticMarkup(<IngredientPickerSearchErrorState message={message} onRetry={() => {}} />);
    expect(html).toContain('role="alert"');
    expect(html).toContain("Подождите немного");
    expect(html).toContain("Повторить поиск");
    expect(html).not.toContain("Ничего не найдено");
    expect(resolveIngredientPickerSearchError(new Error("private server details"))).not.toContain("private server details");
  });
});
