import { expect, test, type Page } from "@playwright/test";

async function openBeer(page: Page) {
  await page.goto("/beer/pilsner-urquell");
  await page.waitForFunction(() => !window.history.pushState.toString().includes("[native code]"));
  // The account-switching badge exists only on this development stand.
  await page.addStyleTag({ content: "body > div.fixed:has(> .bg-warning-subtle) { display: none !important; }" });
}

test.beforeEach(async ({ context, page, baseURL }) => {
  await page.addInitScript(() => {
    document.addEventListener("DOMContentLoaded", () => {
      const style = document.createElement("style");
      style.textContent = "body > div.fixed:has(> .bg-warning-subtle) { display: none !important; }";
      document.head.append(style);
    });
  });
  await context.addCookies([
    { name: "nb_cookie_consent", value: encodeURIComponent("1:necessary"), url: baseURL! },
    { name: "nb_age_ok", value: "1", url: baseURL! },
    { name: "nb_dev_guest", value: "1", url: baseURL! }
  ]);
});

test("QR description remains readable and collapses back to the short viewport", async ({ page }) => {
  await openBeer(page);
  const description = page.getByText(/Оригинальный чешский пилснер:/).filter({ visible: true });
  const disclosure = page.locator("details").filter({ hasText: "Описание пива" });
  if (page.viewportSize()!.height <= 700) {
    const summary = disclosure.locator("summary");
    await expect(summary).toBeVisible();
    await expect(description).toHaveCount(0);
    await summary.tap();
    await expect(disclosure).toHaveAttribute("open", "");
    await expect(description).toBeVisible();
    await summary.tap();
    await expect(disclosure).not.toHaveAttribute("open", "");
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(page.viewportSize()!.height + 2);
  } else {
    await expect(disclosure).toBeHidden();
    await expect(description).toBeVisible();
  }
  const originalViewport = page.viewportSize()!;
  await page.setViewportSize({ width: 375, height: 715 });
  await expect(disclosure.locator("summary")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(717);
  await page.setViewportSize(originalViewport);
  // WebKit updates its touch coordinates after the viewport's next paint.
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await expect(page.getByRole("link", { name: "Рецепт этого пива", exact: true })).toBeInViewport();
  await page.getByRole("link", { name: "Рецепт этого пива", exact: true }).tap();
  await expect(page).toHaveURL(/\/recipes\/pilsner-urquell$/, { timeout: 30_000 });
});

test("QR feedback leaves recipe actions uncovered and can be opened twice", async ({ page }) => {
  await openBeer(page);
  const feedback = page.getByRole("button", { name: "Обратная связь", exact: true });
  const recipe = page.getByRole("link", { name: "Рецепт этого пива", exact: true });
  const [fab, link] = await Promise.all([feedback.boundingBox(), recipe.boundingBox()]);
  expect(fab).not.toBeNull();
  expect(link).not.toBeNull();
  const overlap = Math.max(0, Math.min(fab!.x + fab!.width, link!.x + link!.width) - Math.max(fab!.x, link!.x))
    * Math.max(0, Math.min(fab!.y + fab!.height, link!.y + link!.height) - Math.max(fab!.y, link!.y));
  expect(overlap).toBe(0);
  expect(fab!.width).toBeGreaterThanOrEqual(44);
  expect(fab!.height).toBeGreaterThanOrEqual(44);
  const submissions: string[] = [];
  page.on("request", request => {
    if (request.method() === "POST" && new URL(request.url()).pathname === "/api/feedback") submissions.push(request.url());
  });
  for (let cycle = 0; cycle < 2; cycle++) {
    await feedback.tap();
    const dialog = page.getByRole("dialog", { name: "Обратная связь", exact: true });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("textbox", { name: "Сообщение", exact: true }).fill("ab");
    await dialog.getByRole("button", { name: "Отправить", exact: true }).tap();
    await expect(dialog.getByRole("alert")).toContainText("минимум 5 символов");
    await dialog.getByRole("button", { name: "Отмена", exact: true }).tap();
    await expect(dialog).toBeHidden();
  }
  expect(submissions).toEqual([]);
});

test("label date and description remain editable with readable touch fields", async ({ page }) => {
  await page.goto("/labels");
  await page.waitForFunction(() => !window.history.pushState.toString().includes("[native code]"));
  await page.addStyleTag({ content: "body > div.fixed:has(> .bg-warning-subtle) { display: none !important; }" });
  await page.getByRole("button", { name: "75×120 мм", exact: true }).tap();
  const date = page.getByLabel("Дата розлива", { exact: true });
  await date.tap();
  await date.fill("2026-02-28");
  await date.press("Tab");
  await expect(date).toHaveValue("2026-02-28");
  const description = page.getByRole("textbox", { name: "Описание", exact: true });
  await description.tap();
  await description.fill("Проверка описания в WebKit");
  await description.press("Tab");
  await expect(page.getByRole("link", { name: "Скачать PNG", exact: true })).toHaveAttribute("href", /bottlingDate=2026-02-28/);
  const smallFields = await page.locator("input:visible:not([type=checkbox]),textarea:visible").evaluateAll(elements =>
    elements.filter(element => parseFloat(getComputedStyle(element).fontSize) < 16).map(element => element.id)
  );
  expect(smallFields).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
});

test("BJCP waits for its handlers before accepting the first query", async ({ page }) => {
  let releaseScripts!: () => void;
  const scriptsReady = new Promise<void>(resolve => { releaseScripts = resolve; });
  await page.route("**/_next/static/**/*.js*", async route => {
    await scriptsReady;
    await route.continue();
  });
  try {
    await page.goto("/bjcp", { waitUntil: "commit" });
    const search = page.getByRole("combobox", { name: "Поиск стилей BJCP", exact: true });
    await expect(search).toBeVisible();
    await expect(search).toBeDisabled();
    releaseScripts();
    await expect(search).toBeEnabled({ timeout: 20_000 });
    await search.tap();
    await search.pressSequentially("IPA");
    await expect(search).toHaveValue("IPA");
    await expect.poll(() => new URL(page.url()).searchParams.get("q")).toBe("IPA");
  } finally {
    releaseScripts();
  }
});

test("BJCP suggestions fit the viewport and keyboard selection scrolls inside", async ({ page }) => {
  await page.goto("/bjcp");
  const search = page.getByRole("combobox", { name: "Поиск стилей BJCP", exact: true });
  await search.fill("IPA");
  const list = page.getByRole("listbox", { name: "Подсказки BJCP", exact: true });
  await expect(list).toBeVisible();
  const viewport = page.viewportSize()!;
  await expect.poll(async () => {
    const box = await list.boundingBox();
    return !!box && box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width + 1 && box.y + box.height <= viewport.height + 1;
  }).toBe(true);
  expect((await list.boundingBox())!.height).toBeLessThanOrEqual(320);
  const options = list.getByRole("option");
  for (let index = 1; index < await options.count(); index++) await search.press("ArrowDown");
  await expect(options.last()).toHaveAttribute("aria-selected", "true");
  await expect(options.last()).toBeInViewport({ ratio: 0.95 });
  await search.press("Escape");
  await expect(list).toBeHidden();
  await expect(search).toBeFocused();
  await search.press("ArrowDown");
  await expect(list).toBeVisible();
  await list.getByRole("option", { name: /^IPA, APA и хмелевые стили/ }).tap();
  await expect(list).toBeHidden();
  await expect.poll(() => new URL(page.url()).searchParams.get("family")).not.toBeNull();
  await search.fill("pilsner");
  await expect(list).toBeVisible();
  await page.getByRole("button", { name: "Очистить поиск", exact: true }).tap();
  await expect(search).toHaveValue("");
  await expect(list).toBeHidden();
});

test("cookie choice closes the banner and survives a reload", async ({ page, context }) => {
  await context.clearCookies();
  await page.goto("/bjcp");
  const banner = page.getByRole("region", { name: "Использование файлов cookie", exact: true });
  await expect(banner).toBeVisible();
  await banner.getByRole("button", { name: "Только необходимые", exact: true }).tap();
  await expect(banner).toBeHidden();
  const consent = (await context.cookies()).find(cookie => cookie.name === "nb_cookie_consent");
  expect(decodeURIComponent(consent!.value)).toBe("1:necessary");
  await page.reload();
  const search = page.getByRole("combobox", { name: "Поиск стилей BJCP", exact: true });
  await search.fill("IPA");
  await expect.poll(() => new URL(page.url()).searchParams.get("q")).toBe("IPA");
  await expect(banner).toBeHidden();
});
