import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: () => undefined, refresh: () => undefined })
}));

import { SiteHeader } from "../components/shared/site-header";
import { SiteFooter } from "../components/shared/site-footer";
import { ThemeProvider } from "../components/theme/theme-provider";
import { publicLinks } from "../lib/navigation";

// SiteHeader содержит ThemeToggle (useTheme) — оборачиваем в ThemeProvider, как в
// реальном дереве (Providers в app/layout.tsx).
const renderHeader = () =>
  renderToStaticMarkup(
    React.createElement(ThemeProvider, {
      initialPreference: "system",
      children: React.createElement(SiteHeader, {})
    })
  );

describe("SiteHeader", () => {
  it("guest sees login and public sections, no identity", () => {
    const html = renderHeader();

    expect(html).toContain('href="/login"');
    expect(html).toContain("Войти");
    expect(html).toContain('href="/bjcp"');
    expect(html).toContain('href="/calculators"');
    expect(html).toContain('href="/recipes"');
  });

  it("guest chrome has no app bridge or identity", () => {
    const html = renderHeader();

    expect(html).not.toContain('href="/app"');
    expect(html).not.toContain('href="/profile"');
  });
});

describe("SiteFooter", () => {
  it("lists every public section from publicLinks", () => {
    const html = renderToStaticMarkup(React.createElement(SiteFooter));

    for (const link of publicLinks) {
      expect(html).toContain(`href="${link.href}"`);
      expect(html).toContain(link.label);
    }
  });

  it("only offers guest entry into the account zone", () => {
    const html = renderToStaticMarkup(React.createElement(SiteFooter));

    expect(html).toContain('href="/login"');
    expect(html).toContain("Войти");
    expect(html).not.toContain('href="/app');
    expect(html).not.toContain('href="/profile"');
  });
});
