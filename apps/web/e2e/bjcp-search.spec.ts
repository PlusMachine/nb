import { expect, test } from "@playwright/test";

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([
    { name: "nb_cookie_consent", value: encodeURIComponent("1:necessary"), url: baseURL! },
    { name: "nb_age_ok", value: "1", url: baseURL! }
  ]);
});

test("closing BJCP suggestions preserves a pending search and allows clearing it", async ({ page }) => {
  await page.goto("/bjcp");
  const cookieButton = page.getByRole("button", { name: "Только необходимые", exact: true });
  if (await cookieButton.isVisible()) await cookieButton.click();

  const search = page.getByRole("combobox", { name: "Поиск стилей BJCP" });
  // Establish one query, then close suggestions before the next debounce fires.
  await search.fill("IPA");
  await expect(page).toHaveURL(/[?&]q=IPA(?:&|$)/);
  const query = "несуществующийстильxyz";
  await search.fill(query);
  await search.press("Escape");

  await expect(search).toHaveValue(query);
  await expect(page.getByRole("heading", { name: "По запросу ничего не найдено" })).toBeVisible();
  await expect.poll(() => new URL(page.url()).searchParams.get("q")).toBe(query);

  await page.getByRole("button", { name: "Очистить поиск", exact: true }).click();
  await expect(search).toHaveValue("");
  await expect.poll(() => new URL(page.url()).searchParams.get("q")).toBeNull();
  await expect(page.getByRole("heading", { name: "По запросу ничего не найдено" })).toHaveCount(0);
});

test("clearing before debounce cannot restore a stale query", async ({ page }) => {
  await page.goto("/bjcp", { waitUntil: "networkidle" });
  const cookieButton = page.getByRole("button", { name: "Только необходимые", exact: true });
  if (await cookieButton.isVisible()) await cookieButton.click();
  const search = page.getByRole("combobox", { name: "Поиск стилей BJCP" });
  await search.fill("IPA");
  await page.getByRole("button", { name: "Очистить поиск", exact: true }).click();
  await search.fill("pilsner");
  await search.press("Escape");
  await expect.poll(() => new URL(page.url()).searchParams.get("q")).toBe("pilsner");
  await expect(page.getByRole("heading", { name: "Результаты поиска: pilsner", exact: true })).toBeVisible();
  await search.fill("несуществующийстильxyz");
  await page.getByRole("button", { name: "Очистить поиск", exact: true }).click();
  // Deliberately outlive the debounce: an old timer must not resurrect either query.
  await page.waitForTimeout(500);
  await expect(search).toHaveValue("");
  expect(new URL(page.url()).searchParams.get("q")).toBeNull();
  await expect(page.getByRole("heading", { name: /Результаты поиска:/ })).toHaveCount(0);
});

test("local search and view filters preserve browser history without RSC navigation", async ({ page }) => {
  await page.goto("/bjcp", { waitUntil: "networkidle" });
  const cookieButton = page.getByRole("button", { name: "Только необходимые", exact: true });
  if (await cookieButton.isVisible()) await cookieButton.click();
  const requests: string[] = [];
  page.on("request", request => {
    const url = new URL(request.url());
    if (url.pathname === "/bjcp" && (url.searchParams.has("_rsc") || request.isNavigationRequest())) requests.push(request.url());
  });
  const search = page.getByRole("combobox", { name: "Поиск стилей BJCP" });
  await search.fill("IPA");
  await expect.poll(() => new URL(page.url()).searchParams.get("q")).toBe("IPA");
  await search.press("Escape");
  const beforeView = page.url();
  await page.getByRole("button", { name: "Категории BJCP", exact: true }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get("view")).toBe("bjcp");
  expect(new URL(page.url()).searchParams.get("q")).toBe("IPA");
  await page.goBack();
  await expect(page).toHaveURL(beforeView);
  await expect(search).toHaveValue("IPA");
  await page.goForward();
  await expect.poll(() => new URL(page.url()).searchParams.get("view")).toBe("bjcp");
  await expect(search).toHaveValue("IPA");
  expect(requests).toEqual([]);
});

test("choosing a family suggestion cancels pending text and keeps the chosen scope", async ({ page }) => {
  await page.goto("/bjcp", { waitUntil: "networkidle" });
  const cookieButton = page.getByRole("button", { name: "Только необходимые", exact: true });
  if (await cookieButton.isVisible()) await cookieButton.click();
  const search = page.getByRole("combobox", { name: "Поиск стилей BJCP" });
  await search.fill("IPA");
  await page.getByRole("option", { name: /^IPA, APA и хмелевые стили/ }).click();
  await expect(search).toHaveValue("");
  await expect.poll(() => new URL(page.url()).searchParams.get("family")).not.toBeNull();
  await page.waitForTimeout(500);
  expect(new URL(page.url()).searchParams.get("q")).toBeNull();
  await expect(page.getByRole("heading", { name: /Результаты поиска:/ })).toHaveCount(0);
});

test("back cancels an uncommitted query instead of rewriting the restored history", async ({ page }) => {
  await page.goto("/bjcp", { waitUntil: "networkidle" });
  const cookieButton = page.getByRole("button", { name: "Только необходимые", exact: true });
  if (await cookieButton.isVisible()) await cookieButton.click();
  const search = page.getByRole("combobox", { name: "Поиск стилей BJCP" });
  await search.fill("IPA");
  await expect.poll(() => new URL(page.url()).searchParams.get("q")).toBe("IPA");
  await search.press("Escape");
  const initial = page.url();
  await page.getByRole("button", { name: "Категории BJCP", exact: true }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get("view")).toBe("bjcp");
  await search.fill("query-to-discard");
  await page.goBack();
  await expect(page).toHaveURL(initial);
  await expect(search).toHaveValue("IPA");
  await page.waitForTimeout(500);
  await expect(page).toHaveURL(initial);
});
