import { beforeEach, expect, it, vi } from "vitest";
import type { PublicRecipeDetailDto } from "../features/recipes/contracts";

const render = vi.hoisted(() => vi.fn());
vi.mock("server-only", () => ({}));
vi.mock("@/features/ingredients/service", () => ({ loadIngredients: async () => [] }));
vi.mock("@/features/labels/render", () => ({ renderLabelPreviewPng: render }));
vi.mock("@/features/labels/slots", () => ({ buildLabelSlots: () => ({ authorName: null }) }));
vi.mock("@/lib/env", () => ({ getServerEnv: () => ({ APP_URL: "https://example.com" }) }));

beforeEach(() => { vi.resetModules(); render.mockReset(); });

it("keeps an unavailable label preview optional and retries it on a later visit", async () => {
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    const { getHomeLabelImages } = await import("../features/home/landing-data");
    const recipe = { id: "label-fallback", updatedAt: new Date("2026-11-04") } as PublicRecipeDetailDto;
    render.mockRejectedValueOnce(new Error("Invalid SVG")).mockResolvedValue(Buffer.from("png"));
    await expect(getHomeLabelImages(recipe)).resolves.toBeNull();
    await expect(getHomeLabelImages(recipe)).resolves.toEqual(["data:image/png;base64,cG5n", "data:image/png;base64,cG5n"]);
    const rendered = render.mock.calls.length;
    await getHomeLabelImages(recipe);
    expect(render).toHaveBeenCalledTimes(rendered);
    expect(error).toHaveBeenCalledOnce();
  } finally { error.mockRestore(); }
});
