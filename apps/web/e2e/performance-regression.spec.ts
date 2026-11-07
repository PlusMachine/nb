import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";

test.skip(process.env.PERFORMANCE_QA !== "1", "Requires the isolated production performance stand");
const output = fileURLToPath(new URL("../../../notes/performance-fixes-2026-11-04/", import.meta.url));
const base = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3018";
const authenticate = async (page: Page) => {
  if (new URL(process.env.DATABASE_URL!).pathname !== "/nb_perf_fixes") throw new Error("ISOLATED_DATABASE_REQUIRED");
  const sessions = JSON.parse(readFileSync("/tmp/nb-perf-fixes-sessions-20261104.json", "utf8"));
  await page.context().addCookies([sessions[1].cookie]);
};
const evidence = (name: string, data: unknown) => writeFileSync(output + name + ".json", JSON.stringify(data, null, 2) + "\n");
test.beforeEach(async ({ context }) => {
  await context.addCookies([{ name: "nb_cookie_consent", value: "1:necessary", url: base }, { name: "nb_age_ok", value: "1", url: base }]);
});

test("production homepage renders both real label templates", async ({ page }) => {
  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Что сварить из ваших запасов", exact: true })).toBeVisible();
  const labels = page.locator("#home-labels");
  const image = labels.locator(".home-label-image img");
  await expect(image).toHaveCount(1);
  const images = [];
  for (const template of ["Классика", "Крафт"]) {
    await labels.getByRole("button", { name: template, exact: true }).click();
    await expect(image).toHaveAttribute("alt", new RegExp(template));
    await expect.poll(() => image.evaluate((node: HTMLImageElement) => node.complete && node.naturalWidth > 0)).toBe(true);
    images.push(await image.evaluate((node: HTMLImageElement) => ({ width: node.naturalWidth, bytesBase64: node.src.length })));
  }
  evidence("home-production-labels", images);
});

test("recipe thumbnails use responsive optimized images", async ({ page, browser }) => {
  for (const dpr of [1, 2]) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: dpr });
    const target = await context.newPage();
    const rawPng: string[] = [];
    target.on("request", request => { if (new URL(request.url()).pathname.startsWith("/images/bjcp/") && request.resourceType() === "image") rawPng.push(request.url()); });
    await target.goto(base + "/recipes", { waitUntil: "load" });
    await expect(target.getByRole("heading", { name: "Рецепты сообщества", exact: true })).toBeVisible();
    await expect.poll(() => target.locator('img[src*="/_next/image"]').count()).toBeGreaterThan(0);
    await target.waitForTimeout(1200);
    const images = await target.locator('img[src*="/_next/image"]').evaluateAll(nodes => nodes.slice(0, 5).map(node => ({ src: (node as HTMLImageElement).currentSrc, width: (node as HTMLImageElement).naturalWidth })));
    expect(rawPng).toEqual([]);
    expect(images.every(image => image.width <= 256)).toBe(true);
    evidence("recipe-thumbnails-dpr-" + dpr, images);
    await context.close();
  }
});

for (const account of ["anonymous", "signed-in"] as const) {
  test(`first menu click survives delayed JavaScript for ${account}`, async ({ page }) => {
    if (account === "signed-in") await authenticate(page);
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    await page.route("**/_next/static/**/*.js", async route => { await gate; await route.continue(); });
    const navigation = page.goto(account === "anonymous" ? "/catalog" : "/app/recipes/new", { waitUntil: "load" });
    try {
      const trigger = page.getByRole("button", { name: "Открыть меню", exact: true });
      await trigger.tap();
      await expect(trigger).toHaveAttribute("aria-busy", "true");
    } finally { release(); }
    await navigation;
    if (account === "anonymous") {
      await expect(page.getByRole("button", { name: "Закрыть меню", exact: true })).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.getByRole("button", { name: "Открыть меню", exact: true })).toHaveAttribute("aria-expanded", "false");
    } else {
      await expect(page.getByRole("dialog", { name: "NB", exact: true })).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toHaveCount(0);
    }
  });
}

test("empty editor exposes ingredients and keeps steppers clear of feedback", async ({ page }) => {
  await authenticate(page);
  const bounds = [];
  for (const [width, height] of [[360, 800], [390, 844], [834, 1112]]) {
    await page.setViewportSize({ width, height });
    await page.goto("/app/recipes/new");
    const ingredients = page.locator("section").filter({ has: page.getByRole("heading", { name: "Солод и другое сырьё", exact: true }) });
    const add = ingredients.getByRole("button", { name: "Добавить", exact: true });
    await expect(add).toBeVisible();
    const box = (await add.boundingBox())!;
    expect(box.y + box.height).toBeLessThanOrEqual(height - 56);
    await page.getByText("Настройки и показатели", { exact: true }).click();
    await expect(page.getByRole("button", { name: "Открыть настройки КП", exact: true })).toBeVisible();
    await page.getByText("Настройки и показатели", { exact: true }).click();
    const input = page.getByRole("textbox", { name: /Кипячение, мин/ });
    const label = page.locator("label").filter({ has: input });
    const initial = Number(await input.inputValue());
    for (const name of ["Увеличить", "Уменьшить"]) {
      const button = label.getByRole("button", { name, exact: true });
      const target = (await button.boundingBox())!;
      await page.touchscreen.tap(target.x + target.width / 2, target.y + target.height / 2);
      await expect(input).toHaveValue(String(name === "Увеличить" ? initial + 5 : initial));
      await expect(page.getByRole("dialog")).toHaveCount(0);
    }
    bounds.push({ width, height, firstIngredient: box, scrollWidth: await page.evaluate(() => document.documentElement.scrollWidth) });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Действия с рецептом", exact: true }).click();
  await page.getByRole("menuitem", { name: "Обратная связь", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Обратная связь", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  evidence("editor-fit-after", bounds);
});

test("inventory search and clear complete after repeated visits", async ({ page }) => {
  test.setTimeout(120_000);
  await authenticate(page);
  const results = [];
  for (let repeat = 0; repeat < 8; repeat++) {
    await page.goto("/app/recipes/new");
    await page.getByRole("navigation", { name: "Быстрая навигация" }).getByRole("link", { name: "Склад", exact: true }).click();
    const input = page.getByRole("textbox", { name: "Поиск по складу" });
    await input.fill("цитра");
    await expect.poll(() => new URL(page.url()).searchParams.get("search")).toBe("цитра");
    await expect(page.getByRole("heading", { name: "Цитра", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Пильзнер", exact: true })).toHaveCount(0);
    await expect(page.getByText("Обновляем список…", { exact: true })).toHaveCount(0);
    const started = Date.now();
    await page.getByRole("button", { name: "Очистить поиск", exact: true }).click();
    await expect(input).toHaveValue("");
    await expect.poll(() => new URL(page.url()).searchParams.get("search") ?? "").toBe("");
    await expect(page.getByRole("heading", { name: "Пильзнер", exact: true })).toBeVisible();
    await expect(page.getByText("Обновляем список…", { exact: true })).toHaveCount(0);
    results.push({ repeat, elapsedMs: Date.now() - started });
  }
  evidence("inventory-clear-after", results);
});

test("clear wins over a delayed search response and Back restores search", async ({ page }) => {
  await authenticate(page);
  await page.goto("/app/ingredients");
  let release!: () => void;
  let requested!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const requestStarted = new Promise<void>(resolve => { requested = resolve; });
  await page.route("**/api/inventory**", async route => {
    if (new URL(route.request().url()).searchParams.get("search") === "цитра") { requested(); await gate; }
    await route.continue().catch(() => {});
  });
  const input = page.getByRole("textbox", { name: "Поиск по складу" });
  try {
    await input.fill("цитра");
    await requestStarted;
    await page.getByRole("button", { name: "Очистить поиск", exact: true }).click();
  } finally { release(); }
  await expect(input).toHaveValue("");
  await expect(page.getByRole("heading", { name: "Пильзнер", exact: true })).toBeVisible();
  await expect(page.getByText("Обновляем список…", { exact: true })).toHaveCount(0);
  await expect.poll(() => new URL(page.url()).searchParams.get("search") ?? "").toBe("");
  await page.unroute("**/api/inventory**");
  await input.fill("цитра");
  await expect.poll(() => new URL(page.url()).searchParams.get("search")).toBe("цитра");
  await expect(page.getByRole("heading", { name: "Пильзнер", exact: true })).toHaveCount(0);
  await page.getByRole("navigation", { name: "Быстрая навигация" }).getByRole("link", { name: "Склад", exact: true }).click();
  await expect(input).toHaveValue("");
  await page.goBack();
  await expect(input).toHaveValue("цитра");
  await expect(page.getByRole("heading", { name: "Пильзнер", exact: true })).toHaveCount(0);
});

test("inventory request failure can be retried without losing the query", async ({ page }) => {
  await authenticate(page);
  await page.goto("/app/ingredients");
  await page.route("**/api/inventory**", route => route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "QA_FAILURE" }) }));
  const input = page.getByRole("textbox", { name: "Поиск по складу" });
  await input.fill("цитра");
  const error = page.getByRole("alert").filter({ hasText: "Не удалось обновить список" });
  await expect(error).toBeVisible();
  await expect(input).toHaveValue("цитра");
  await page.unroute("**/api/inventory**");
  await error.getByRole("button", { name: "Повторить", exact: true }).click();
  await expect(error).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Пильзнер", exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Цитра", exact: true })).toBeVisible();
  await expect(page.getByText("Обновляем список…", { exact: true })).toHaveCount(0);
});

test("recipe autosave, reload and retry preserve the user's changes", async ({ page }) => {
  await authenticate(page);
  await page.goto("/app/recipes/new");
  const title = `QA performance fixes ${Date.now()}`;
  const input = page.getByRole("textbox", { name: "Название рецепта", exact: true });
  await expect(input).toHaveCount(1);
  await input.fill(title);
  await page.getByText("Сохранено", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Добавить солод, сахар или экстракт", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: /^Пильзнер Weyermann/ }).click();
  await dialog.getByRole("textbox").fill("4.5");
  await dialog.getByRole("button", { name: "Добавить ингредиент", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByText("Сохранено", { exact: true }).waitFor();
  await page.reload();
  await expect(input).toHaveValue(title);
  await expect(page.locator('li input[value="4.5"]')).toHaveCount(1);
  await page.route("**/app/recipes/**", route => route.request().method() === "POST" ? route.abort("failed") : route.continue());
  await input.fill(title + " retry");
  await page.getByRole("button", { name: "Повторить", exact: true }).waitFor();
  await page.unroute("**/app/recipes/**");
  await page.getByRole("button", { name: "Повторить", exact: true }).click();
  await page.getByText("Сохранено", { exact: true }).waitFor();
  await page.reload();
  await expect(input).toHaveValue(title + " retry");
  await expect(page.locator('li input[value="4.5"]')).toHaveCount(1);
});
