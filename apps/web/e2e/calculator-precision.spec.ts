import { expect, test } from "@playwright/test";
import { mountGravityCalculator } from "./fixtures/gravity-calculator-harness";

test("ABV: смена шкалы, blur и перезагрузка сохраняют крепость и калории", async ({ page }) => {
  await mountGravityCalculator(page, { slug: "abv-attenuation" });
  const og = page.getByLabel(/Начальная плотность/);
  const fg = page.getByLabel(/Конечная плотность/);
  const scale = page.getByRole("group", { name: "Шкала плотности", exact: true });
  const result = page.locator("#calculator-result");
  const abv = result.locator(".text-4xl");
  const calories = result.locator("dl > div").filter({ has: page.getByText("Калории", { exact: true }) }).locator("dd");
  await og.fill("13,0");
  await fg.fill("3,1");
  await scale.getByRole("button", { name: "°P", exact: true }).click();
  const expectedAbv = await abv.innerText();
  const expectedCalories = await calories.innerText();
  for (let i = 0; i < 3; i++) {
    await scale.getByRole("button", { name: "SG", exact: true }).click();
    await og.focus();
    await fg.focus();
    await scale.getByRole("button", { name: "°P", exact: true }).click();
    await expect(abv).toHaveText(expectedAbv);
    await expect(calories).toHaveText(expectedCalories);
    await expect(og).toHaveValue("13");
    await expect(fg).toHaveValue("3.1");
  }
  await scale.getByRole("button", { name: "SG", exact: true }).click();
  await mountGravityCalculator(page, { slug: "abv-attenuation", reload: true });
  await expect(abv).toHaveText(expectedAbv);
  await expect(calories).toHaveText(expectedCalories);
  await expect(og).toHaveValue("1.053");
});

test("калибровка WCF: переключение шкалы и blur не округляют исходный замер", async ({ page }) => {
  await mountGravityCalculator(page);
  await page.getByText("Настроить поправочный коэффициент", { exact: true }).click();
  const hydrometer = page.getByLabel(/Ареометр \/ сахаромер/);
  const refractometer = page.getByLabel(/^Рефрактометр/);
  await hydrometer.fill("13.0");
  await refractometer.fill("13.5");
  const coefficient = page.getByText(/13.5 ÷/);
  const expected = await coefficient.innerText();
  const scale = page.getByRole("group", { name: "Шкала ареометра", exact: true });
  await scale.getByRole("button", { name: "SG", exact: true }).click();
  await hydrometer.focus();
  await refractometer.focus();
  await expect(coefficient).toHaveText(expected);
  await scale.getByRole("button", { name: "°P", exact: true }).click();
  await expect(coefficient).toHaveText(expected);
});
