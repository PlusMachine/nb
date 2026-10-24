import { expect, test, type Page } from "@playwright/test";

const dismissCookieBanner = async (page: Page) => {
  await page.getByRole("button", { name: "Только необходимые", exact: true }).click();
};

const themeTrigger = (page: Page) => page.getByRole("button", { name: "Тема оформления", exact: true }).last();

test("выбор темы в публичной шапке сохраняет режим и независимый скин", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  // /demo сохраняет публичную шапку и при dev-автологине.
  await page.goto("/demo");
  await dismissCookieBanner(page);
  if (page.viewportSize()!.width < 640) {
    await page.getByRole("button", { name: "Открыть меню", exact: true }).click();
  }
  await themeTrigger(page).click();
  await page.getByRole("radio", { name: "Тёмная тема", exact: true }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(page.getByRole("radio")).toHaveCount(0);
  await expect(themeTrigger(page)).toBeFocused();

  await themeTrigger(page).click();
  await page.getByRole("button", { name: "Оформление «Хмель» выключено", exact: true }).click();
  await expect(page.locator("html")).toHaveClass(/skin-hop/);
  await expect(page.getByRole("button", { name: "Оформление «Хмель» включено", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Escape");
  await expect(themeTrigger(page)).toBeFocused();

  const preferences = (await page.context().cookies()).filter(cookie => ["nb_theme", "nb_skin"].includes(cookie.name));
  expect(preferences).toEqual(expect.arrayContaining([
    expect.objectContaining({ name: "nb_theme", value: "dark" }),
    expect.objectContaining({ name: "nb_skin", value: "hop" })
  ]));
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(page.locator("html")).toHaveClass(/skin-hop/);

  if (page.viewportSize()!.width < 640) {
    await page.getByRole("button", { name: "Открыть меню", exact: true }).click();
  }
  await themeTrigger(page).click();
  await page.getByRole("radio", { name: "Как в системе", exact: true }).click();
  await expect(page.locator("html")).not.toHaveClass(/dark/);
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).not.toHaveClass(/dark/);

  await themeTrigger(page).click();
  await page.getByRole("button", { name: "Оформление «Хмель» включено", exact: true }).click();
  await expect(page.locator("html")).not.toHaveClass(/skin-hop/);
  await page.getByRole("radio", { name: "Светлая тема", exact: true }).click();
  await expect(page.locator("html")).not.toHaveClass(/dark/);
});

test("меню темы внутри мобильной панели принимает клики и закрывается отдельно", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "мобильная панель навигации");
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto("/app/recipes/new");
  await dismissCookieBanner(page);
  await expect(page.getByRole("button", { name: "Сварить", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Открыть меню", exact: true }).click();
  const navigation = page.getByRole("dialog").filter({ has: page.getByRole("navigation", { name: "Навигация рабочей зоны" }) });
  const trigger = navigation.getByRole("button", { name: "Тема оформления", exact: true });
  await trigger.click();
  await page.getByRole("radio", { name: "Тёмная тема", exact: true }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(navigation).toBeVisible();

  await trigger.click();
  await page.keyboard.press("Home");
  await expect(page.getByRole("radio", { name: "Светлая тема", exact: true })).toBeChecked();
  await page.keyboard.press("End");
  await expect(page.getByRole("radio", { name: "Как в системе", exact: true })).toBeChecked();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("radio")).toHaveCount(0);
  await expect(navigation).toBeVisible();
  await expect(trigger).toBeFocused();
  await navigation.getByRole("button", { name: "Закрыть", exact: true }).click();
  await expect(navigation).toBeHidden();
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.body).pointerEvents)).not.toBe("none");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
