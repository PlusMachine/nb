import { expect, test } from "@playwright/test";

test("BrewForge показывает полный пульт и выполняет команды в локальном симуляторе", async ({ page, baseURL }) => {
  const errors: string[] = [];
  const deviceRequests: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("request", request => {
    if (/\/api\/(devices|brew-batches)\//.test(request.url())) deviceRequests.push(request.url());
  });

  await page.context().addCookies([{ name: "nb_dev_guest", value: "1", url: baseURL! }]);
  await page.goto("/brewforge");
  await page.getByRole("button", { name: "Только необходимые", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Автоматика для пивоварни", exact: true })).toBeVisible();
  await expect(page.getByText("История температуры", { exact: true })).toBeVisible();
  await expect(page.getByText("Ход варки", { exact: true })).toBeVisible();
  await expect(page.getByText("Контур", { exact: true })).toBeVisible();
  await expect(page.getByText("Датчики", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Попробовать помощник варки", exact: true }))
    .toHaveAttribute("href", "/login?next=/app/brew-batches");

  await page.getByRole("button", { name: "Пауза", exact: true }).click();
  await expect(page.getByRole("button", { name: "Продолжить", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Далее", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Продолжить", exact: true }).click();
  await expect(page.getByRole("button", { name: "Пауза", exact: true })).toBeVisible();

  const next = page.getByRole("button", { name: "Далее", exact: true });
  await next.click();
  await expect(next).toBeDisabled();
  await page.getByRole("button", { name: "Отменить", exact: true }).click();
  await expect(next).toBeEnabled();
  await next.click();
  await expect(page.getByText("Стадия пропущена", { exact: true })).toBeVisible({ timeout: 10_000 });

  await page.getByRole("button", { name: "Стоп", exact: true }).click();
  const confirmation = page.getByRole("dialog", { name: "Остановить варку?", exact: true });
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole("button", { name: "Отмена", exact: true }).click();
  await expect(confirmation).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Пауза", exact: true })).toBeEnabled();

  expect(deviceRequests).toEqual([]);
  expect(errors).toEqual([]);
});
