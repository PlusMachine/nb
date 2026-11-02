import { expect, test, type Page } from "@playwright/test";
import { mountGravityCalculator } from "./fixtures/gravity-calculator-harness";

const originalScale = (page: Page) => page.getByRole("group", { name: "Шкала начальной плотности" });
const wcfScale = (page: Page) => page.getByRole("group", { name: "Шкала ареометра" });
const result = (page: Page) => page.locator("#calculator-result");
const mobileResult = (page: Page) => page.getByRole("button", { name: /Плотность с поправкой/ });
const stored = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem("hmelo.calculators.refractometer-correction.lastState") ?? "{}"));

test("по умолчанию °P главный и в полной панели, и в мобильном результате", async ({ page }) => {
  await mountGravityCalculator(page);
  await expect(originalScale(page).getByRole("button", { name: "°P", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(result(page)).toContainText(/\d\.\d°P.*\d\.\d{3} SG/);
  await expect(mobileResult(page)).toContainText(/\d\.\d °P.*\d\.\d{3} SG/);
});

test("профиль с °Bx сохраняет °Bx основным в обеих панелях", async ({ page }) => {
  await mountGravityCalculator(page, { unit: "brix" });
  await expect(mobileResult(page)).toContainText(/\d\.\d °Bx.*\d\.\d{3} SG/);
  await expect(result(page)).toContainText(/\d\.\d°Bx.*\d\.\d{3} SG/);
});

test("SG из профиля остаётся основным и используется в калибровке", async ({ page }) => {
  await mountGravityCalculator(page, { unit: "sg" });
  await expect(mobileResult(page)).toContainText(/\d\.\d{3} SG.*\d\.\d °P/);
  await page.getByText("Настроить поправочный коэффициент", { exact: true }).click();
  await expect(wcfScale(page).getByRole("button", { name: "SG", exact: true })).toHaveAttribute("aria-pressed", "true");
});

test("ручной выбор SG запоминается и имеет приоритет над профилем °P", async ({ page }) => {
  await mountGravityCalculator(page);
  await expect(mobileResult(page)).toContainText("°P");
  await originalScale(page).getByRole("button", { name: "SG", exact: true }).click();
  await expect.poll(() => stored(page)).toMatchObject({ originalUnit: "SG", gravityUnitTouched: true });
  await mountGravityCalculator(page, { reload: true });
  await expect(originalScale(page).getByRole("button", { name: "SG", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(mobileResult(page)).toContainText(/\d\.\d{3} SG.*\d\.\d °P/);
});

test("WCF переводит введённый замер и запоминает собственную шкалу отдельно от OG", async ({ page }) => {
  await mountGravityCalculator(page);
  await expect(mobileResult(page)).toContainText("°P");
  await page.getByText("Настроить поправочный коэффициент", { exact: true }).click();
  const hydro = page.getByLabel(/Ареометр \/ сахаромер/);
  await expect(wcfScale(page).getByRole("button", { name: "°P", exact: true })).toHaveAttribute("aria-pressed", "true");
  await hydro.fill("12.4");
  await wcfScale(page).getByRole("button", { name: "SG", exact: true }).click();
  await expect(hydro).toHaveValue("1.050");
  await expect.poll(() => stored(page)).toMatchObject({ wcfHydrometerUnit: "SG", originalUnit: "Plato" });
  await wcfScale(page).getByRole("button", { name: "°P", exact: true }).click();
  await expect(hydro).toHaveValue("12.4");
  await wcfScale(page).getByRole("button", { name: "SG", exact: true }).click();
  await expect.poll(() => stored(page)).toMatchObject({ wcfHydrometerUnit: "SG" });
  await mountGravityCalculator(page, { reload: true });
  await page.getByText("Настроить поправочный коэффициент", { exact: true }).click();
  await expect(wcfScale(page).getByRole("button", { name: "SG", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(originalScale(page).getByRole("button", { name: "°P", exact: true })).toHaveAttribute("aria-pressed", "true");
});

test("поздняя загрузка профиля не перезаписывает уже сделанный выбор", async ({ page }) => {
  await mountGravityCalculator(page, { delayedProfile: true });
  await originalScale(page).getByRole("button", { name: "SG", exact: true }).click();
  await page.evaluate(() => (window as unknown as { resolveGravityProfile: () => void }).resolveGravityProfile());
  await expect(mobileResult(page)).toContainText(/\d\.\d{3} SG.*°P/);
  await expect.poll(() => stored(page)).toMatchObject({ originalUnit: "SG", gravityUnitTouched: true });
});

test("ссылка на расчёт с явной шкалой SG сохраняет её после загрузки профиля", async ({ page }) => {
  await mountGravityCalculator(page, { query: "originalUnit=SG&originalValue=1.050" });
  await expect(mobileResult(page)).toContainText(/\d\.\d{3} SG.*°P/);
});
