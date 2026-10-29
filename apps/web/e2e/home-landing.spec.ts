import { expect, test } from "@playwright/test";

test.describe("public homepage examples", () => {
  test.beforeEach(async ({ page, baseURL }) => {
    // Exercise the anonymous landing page even when local dev autologin is enabled.
    await page.context().addCookies([{ name: "nb_dev_guest", value: "1", url: baseURL ?? "http://127.0.0.1:3000" }]);
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Что сварить из ваших запасов", exact: true })).toBeVisible();
  });

  test("compares the same stock with real recipes and recovers from invalid input", async ({ page }) => {
    const stock = page.locator("#home-stock");
    const firstRecipe = page.locator(".home-recipe-card").first();
    await expect(firstRecipe.getByText(/Хватает на|Все ингредиенты есть/, { exact: false }).first()).toBeVisible();
    const input = stock.locator("input").first();
    const original = await input.inputValue();
    await input.fill("нет");
    await input.press("Enter");
    await expect(input).toHaveAttribute("aria-invalid", "true");
    await input.fill("0");
    await input.press("Enter");
    await expect(input).not.toHaveAttribute("aria-invalid", "true");
    await expect(page.locator("#home-recipes").getByText(/Не хватает/).first()).toBeVisible();
    await expect(firstRecipe.getByRole("link", { name: "В список покупок" })).toHaveAttribute("href", "/login?next=%2Fapp%2Fshopping");
    await input.fill(original);
    await input.press("Enter");
    await expect(firstRecipe.getByText(/Хватает на|Все ингредиенты есть/, { exact: false }).first()).toBeVisible();
    await expect(firstRecipe.getByRole("link", { name: "Открыть рецепт" })).toHaveAttribute("href", /^\/recipes\//);
    await expect(page.getByRole("link", { name: "Добавить свои запасы" })).toHaveAttribute("href", "/login?next=%2Fapp%2Fingredients%3Fadd%3D1");
  });

  test("runs, pauses and resets the example timer", async ({ page }) => {
    const brew = page.locator("#home-brew");
    const clock = brew.getByRole("timer");
    const initial = await clock.textContent();
    await brew.getByRole("button", { name: "Запустить таймер", exact: true }).click();
    await expect(clock).not.toHaveText(initial!);
    await brew.getByRole("button", { name: "Пауза", exact: true }).click();
    await expect(brew.getByText("Таймер на паузе", { exact: true })).toBeVisible();
    const paused = await clock.textContent();
    await page.waitForTimeout(1100);
    await expect(clock).toHaveText(paused!);
    await brew.getByRole("button", { name: "Сбросить таймер примера" }).click();
    await expect(clock).toHaveText(initial!);
    await expect(brew.getByRole("button", { name: "Запустить таймер", exact: true })).toBeVisible();
  });

  test("preserves ingredient identity when scaling and separates the brewing stage from the name", async ({ page }) => {
    const editor = page.locator("#home-master");
    const first = editor.locator(".home-editor-ingredient").first();
    const title = await first.locator(".home-ingredient-title").innerText();
    const original = await first.locator(".home-ingredient-amount").innerText();
    const originalValue = Number.parseFloat(original.replace(",", "."));
    await editor.getByLabel("Объём партии", { exact: true }).selectOption("2");
    await expect(first.locator(".home-ingredient-title")).toHaveText(title);
    await expect(first.locator(".home-ingredient-amount")).not.toHaveText(original);
    const doubled = await first.locator(".home-ingredient-amount").innerText();
    expect(Number.parseFloat(doubled.replace(",", "."))).toBeCloseTo(originalValue * 2);
    const identity = await first.locator(".home-ingredient-details>div").first().boundingBox();
    const stage = await first.locator(".home-ingredient-stage").boundingBox();
    expect(stage!.y).toBeGreaterThanOrEqual(identity!.y + identity!.height + 4);
    const expand = editor.getByRole("button", { name: /Показать весь состав/ });
    if (await expand.count()) {
      const count = await editor.locator(".home-editor-ingredient").count();
      await expand.click();
      expect(await editor.locator(".home-editor-ingredient").count()).toBeGreaterThan(count);
      await editor.getByRole("button", { name: "Свернуть состав", exact: true }).click();
      await expect(editor.locator(".home-editor-ingredient")).toHaveCount(count);
    }
    const flags = page.locator("#home-stock .home-ingredient-details svg");
    expect(await flags.count()).toBeGreaterThan(0);
    for (const flag of await flags.all()) {
      const bounds = await flag.boundingBox();
      expect(bounds!.width).toBeGreaterThan(bounds!.height);
      expect(bounds!.height).toBeLessThanOrEqual(18);
    }
  });

  test("keeps the recipe, volume, timer and consumption in sync with the editor", async ({ page }) => {
    const editor = page.locator("#home-master");
    const brew = page.locator("#home-brew");
    const volume = editor.getByLabel("Объём партии", { exact: true });
    const selection = editor.getByLabel("Пример рецепта", { exact: true });
    const title = await selection.locator("option:checked").textContent();
    await volume.selectOption("2");
    await expect(brew.locator(".home-brew-title h3")).toHaveText(title!);
    await expect(brew.locator(".home-brew-title>span")).toHaveText((await volume.locator("option:checked").textContent())!);
    await expect(brew.getByRole("heading", { name: "Журнал партии", exact: true })).toBeVisible();
    const note = brew.getByRole("textbox", { name: "Что учесть в следующей варке" });
    await note.fill("Сравнить с предыдущей партией");
    const initial = await brew.getByRole("timer").textContent();
    await brew.getByRole("button", { name: "Запустить таймер", exact: true }).click();
    await expect(brew.getByRole("timer")).not.toHaveText(initial!);
    await volume.selectOption("0.5");
    await expect(brew.locator(".home-brew-title>span")).toHaveText((await volume.locator("option:checked").textContent())!);
    await expect(brew.getByRole("button", { name: "Запустить таймер", exact: true })).toBeVisible();
    await expect(note).toHaveValue("Сравнить с предыдущей партией");
    await brew.locator("summary").click();
    const ingredientAmount = await editor.locator(".home-editor-ingredient .home-ingredient-amount").first().innerText();
    await expect(brew.locator("tbody tr").first().locator("td").nth(1)).toHaveText(ingredientAmount);
    await selection.selectOption({ index: 1 });
    await expect(brew.locator(".home-brew-title h3")).toHaveText((await selection.locator("option:checked").textContent())!);
    await expect(volume).toHaveValue("1");
    await expect(brew.locator(".home-brew-title>span")).toHaveText((await volume.locator("option:checked").textContent())!);
  });

  test("saves journal input and confirms a reversible example consumption without a server action", async ({ page }) => {
    const mutations: string[] = [];
    page.on("request", request => {
      if (request.method() === "POST" && (request.headers()["next-action"] || /\/api\/.*(?:inventory|brew-batches)/.test(request.url()))) mutations.push(request.url());
    });
    const brew = page.locator("#home-brew");
    const note = brew.getByRole("textbox", { name: "Что учесть в следующей варке" });
    await note.fill("Заметка в примере");
    await brew.getByRole("button", { name: "Сохранить в примере", exact: true }).click();
    await expect(brew.locator(".home-brew-note-footer").getByRole("status")).toHaveText("Сохранено в примере на этом устройстве");
    await brew.locator("summary").click();
    await brew.getByRole("button", { name: "Списать ингредиенты", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Отмена", exact: true }).click();
    await expect(brew.getByRole("button", { name: "Списать ингредиенты", exact: true })).toBeVisible();
    await brew.getByRole("button", { name: "Списать ингредиенты", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Подтвердить списание", exact: true }).click();
    await expect(brew.locator(".home-brew-stock").getByRole("status")).toHaveText("Ингредиенты списаны в примере партии.");
    await brew.getByRole("button", { name: "Вернуть на склад", exact: true }).click();
    await expect(brew.locator(".home-brew-stock").getByRole("status")).toHaveText("Ингредиенты возвращены в запасы примера.");
    await expect(note).toHaveValue("Заметка в примере");
    await page.reload();
    await expect(note).toHaveValue("Заметка в примере");
    const selection = page.getByLabel("Пример рецепта", { exact: true });
    await selection.selectOption({ index: 1 });
    await expect(note).not.toHaveValue("Заметка в примере");
    await selection.selectOption({ index: 0 });
    await expect(note).toHaveValue("Заметка в примере");
    expect(mutations).toEqual([]);
  });

  test("fits the stock example and new panels on narrow and desktop screens", async ({ page }) => {
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const open of [true, false]) {
        await page.locator("#home-brew summary").click();
        if (open) await expect(page.locator("#home-brew details")).toHaveAttribute("open");
        else await expect(page.locator("#home-brew details")).not.toHaveAttribute("open");
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      }
      for (const tab of ["Состав и расчёты", "Вода", "Затирание и брожение", "Оборудование"]) {
        await page.locator("#home-master").getByRole("tab", { name: tab, exact: true }).click();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      }
    }
  });
});
