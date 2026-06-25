import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: () => undefined, refresh: () => undefined })
}));

import { SiteHeader } from "../components/shared/site-header";
import { SiteFooter } from "../components/shared/site-footer";

describe("SiteHeader", () => {
  it("guest sees login and public sections, no identity", () => {
    const html = renderToStaticMarkup(
      React.createElement(SiteHeader, { user: null, variant: "public" })
    );

    expect(html).toContain('href="/login"');
    expect(html).toContain("Войти");
    expect(html).toContain('href="/bjcp"');
    expect(html).toContain('href="/calculators"');
    expect(html).toContain('href="/recipes"');
  });

  it("authenticated user sees identity and an app bridge, but no login", () => {
    const html = renderToStaticMarkup(
      React.createElement(SiteHeader, {
        user: { email: "brewer@example.com", displayName: "Brewer" },
        variant: "public"
      })
    );

    expect(html).toContain("Brewer");
    expect(html).toContain('href="/app"');
    expect(html).not.toContain('href="/login"');
  });
});

describe("SiteFooter", () => {
  it("anchors every zone with links", () => {
    const html = renderToStaticMarkup(React.createElement(SiteFooter));

    expect(html).toContain('href="/app/recipes"');
    expect(html).toContain('href="/bjcp"');
    expect(html).toContain('href="/calculators"');
    expect(html).toContain('href="/profile"');
  });
});
