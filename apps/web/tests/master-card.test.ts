import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// MasterImage → next/image; тот же мок, что и у RecipeCard-тестов.
vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) =>
    React.createElement("img", { src: props.src as string, alt: (props.alt as string) ?? "" })
}));

import { MasterCard } from "../components/masters/public/master-card";
import type { MasterCardDto } from "../features/masters/service";

const baseMaster = (overrides: Partial<MasterCardDto> = {}): MasterCardDto => ({
  id: "m-1",
  slug: "kuznya-ivanova",
  displayName: "Кузница Иванова",
  city: "Тюмень",
  specializations: ["vessels", "automation"],
  summary: "ЦКТ и краны на заказ, доставка по РФ.",
  craftSince: 2018,
  coverImage: null,
  publishedAt: new Date("2026-01-01T00:00:00.000Z"),
  ...overrides
});

describe("MasterCard", () => {
  it("wraps the whole card in a link to /masters/<slug> with the name and city visible", () => {
    const html = renderToStaticMarkup(React.createElement(MasterCard, { master: baseMaster() }));
    expect(html).toContain('href="/masters/kuznya-ivanova"');
    expect(html).toContain("Кузница Иванова");
    expect(html).toContain("Тюмень");
    expect(html).toContain("ЦКТ и краны на заказ, доставка по РФ.");
  });

  it("renders a placeholder (no <img>) when there is no cover image", () => {
    const html = renderToStaticMarkup(React.createElement(MasterCard, { master: baseMaster() }));
    expect(html).not.toContain("<img");
  });

  it("renders the medium variant of the cover image when present", () => {
    const html = renderToStaticMarkup(
      React.createElement(MasterCard, { master: baseMaster({ coverImage: { imageId: "img-1", blurDataUrl: null } }) })
    );
    expect(html).toContain('src="/api/master-images/img-1/medium"');
  });

  it("shows specialization labels and a +N overflow chip beyond 3", () => {
    const html = renderToStaticMarkup(
      React.createElement(MasterCard, {
        master: baseMaster({ specializations: ["vessels", "automation", "chillers", "mills", "heating"] })
      })
    );
    expect(html).toContain("Ёмкости и ЦКТ");
    expect(html).toContain("Автоматика");
    expect(html).toContain("Чиллеры");
    expect(html).not.toContain("Мельницы");
    expect(html).not.toContain("Нагрев и ТЭНы");
    expect(html).toContain("+2");
  });

  it("does not show an overflow chip when there are 3 or fewer specializations", () => {
    const html = renderToStaticMarkup(React.createElement(MasterCard, { master: baseMaster() }));
    expect(html).not.toMatch(/\+\d/);
  });
});
