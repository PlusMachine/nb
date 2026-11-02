import { expect, test, type Page } from "@playwright/test";
import { mountGravityCalculator } from "./fixtures/gravity-calculator-harness";

const cases = [
  { slug: "abv-attenuation", unitField: "gravityUnit", fields: [[/Начальная плотность/, "12.4", "1.050"], [/Конечная плотность/, "3.1", "1.012"]], brix: false },
  { slug: "dilution-boiloff", unitField: "gravityUnit", fields: [[/Текущая плотность/, "14.7", "1.060"], [/Целевая плотность/, "12.4", "1.050"]] },
  { slug: "hydrometer-correction", unitField: "readingUnit", fields: [[/Показание ареометра/, "12.4", "1.050"]] },
  { slug: "ibu", unitField: "gravityUnit", fields: [[/^Плотность сусла/, "12.4", "1.050"]] },
  { slug: "yeast-starter", unitField: "gravityUnit", fields: [[/^Плотность/, "12.4", "1.050"]] },
  { slug: "speise-krausen", unitField: "gravityUnit", fields: [[/^Плотность сусла/, "12.4", "1.050"]] },
  { slug: "brewhouse-efficiency", unitField: "gravityUnit", fields: [[/Замеренная НП/, "12.4", "1.050"]] }
] as const;

const scale = (page: Page) => page.getByRole("group", { name: "Шкала плотности", exact: true });
const stored = (page: Page, slug: string) => page.evaluate(slug => JSON.parse(localStorage.getItem(`hmelo.calculators.${slug}.lastState`) ?? "{}"), slug);

for (const entry of cases) {
  for (const unit of ["plato", "brix", "sg"] as const) {
    test(`${entry.slug}: поля учитывают профиль ${unit}`, async ({ page }) => {
      await mountGravityCalculator(page, { slug: entry.slug, unit });
      const selected = unit === "sg" ? "SG" : unit === "brix" && !("brix" in entry) ? "°Bx" : "°P";
      await expect(scale(page).getByRole("button", { name: selected, exact: true })).toHaveAttribute("aria-pressed", "true");
      for (const [label, plato, sg] of entry.fields) {
        await expect(page.getByLabel(label)).toHaveValue(unit === "sg" ? sg : plato);
      }
    });
  }

  test(`${entry.slug}: переключение пересчитывает все поля и запоминается`, async ({ page }) => {
    await mountGravityCalculator(page, { slug: entry.slug });
    await expect.poll(() => stored(page, entry.slug)).toMatchObject({ [entry.unitField]: "Plato" });
    await scale(page).getByRole("button", { name: "SG", exact: true }).click();
    for (const [label, , sg] of entry.fields) await expect(page.getByLabel(label)).toHaveValue(sg);
    await expect.poll(() => stored(page, entry.slug)).toMatchObject({ [entry.unitField]: "SG", gravityUnitTouched: true });
    await mountGravityCalculator(page, { slug: entry.slug, reload: true });
    await expect(scale(page).getByRole("button", { name: "SG", exact: true })).toHaveAttribute("aria-pressed", "true");
    for (const [label, , sg] of entry.fields) await expect(page.getByLabel(label)).toHaveValue(sg);
    await scale(page).getByRole("button", { name: "°P", exact: true }).click();
    for (const [label, plato] of entry.fields) await expect(page.getByLabel(label)).toHaveValue(plato);
    if (!("brix" in entry)) {
      await scale(page).getByRole("button", { name: "°Bx", exact: true }).click();
      for (const [label, plato] of entry.fields) await expect(page.getByLabel(label)).toHaveValue(plato);
    }
  });
}

test("ареометр: вместе с показанием пересчитывается поправка прибора", async ({ page }) => {
  const slug = "hydrometer-correction";
  await mountGravityCalculator(page, { slug });
  await expect.poll(() => stored(page, slug)).toMatchObject({ readingUnit: "Plato" });
  await page.locator("summary").click();
  const offset = page.getByLabel(/Поправка прибора/);
  await offset.fill("0,5");
  await scale(page).getByRole("button", { name: "SG", exact: true }).click();
  await expect(offset).toHaveValue("0.0019");
  await scale(page).getByRole("button", { name: "°P", exact: true }).click();
  await expect(offset).toHaveValue("0.5");
});

test("ареометр: отрицательные °P сухого пива сохраняются при переходе в SG", async ({ page }) => {
  await mountGravityCalculator(page, { slug: "hydrometer-correction" });
  const input = page.getByLabel(/Показание ареометра/);
  await input.fill("-0,5");
  await scale(page).getByRole("button", { name: "SG", exact: true }).click();
  await expect(input).toHaveValue("0.998");
  await scale(page).getByRole("button", { name: "°P", exact: true }).click();
  await expect(input).toHaveValue("-0.5");
});

test("рефрактометр: шкала OG пересчитывает замер с учётом WCF, сырые °Bx остаются °Bx", async ({ page }) => {
  await mountGravityCalculator(page);
  const group = page.getByRole("group", { name: "Шкала начальной плотности" });
  await expect(group.getByRole("button", { name: "°P", exact: true })).toHaveAttribute("aria-pressed", "true");
  const og = page.getByLabel(/Начальная плотность/);
  await expect(og).toHaveValue("11.9");
  await group.getByRole("button", { name: "SG", exact: true }).click();
  await expect(og).toHaveValue("1.048");
  await group.getByRole("button", { name: "Brix", exact: true }).click();
  await expect(og).toHaveValue("12.4");
  await expect(page.getByLabel(/Текущая плотность/)).toHaveValue("6.5");
});

test("конвертер: профиль SG переводит исходные 12.4 °P в 1.050 SG", async ({ page }) => {
  await mountGravityCalculator(page, { slug: "unit-converter", unit: "sg" });
  await expect.poll(() => stored(page, "unit-converter")).toMatchObject({ gravityFrom: "SG", gravityValue: "1.050" });
  await expect(page.getByLabel(/^SG/)).toHaveValue("1.050");
  await expect(page.getByLabel(/^°P/)).toHaveValue("12.4");
});

test("конвертер: выбор поля SG запоминается, все соседние значения согласованы", async ({ page }) => {
  await mountGravityCalculator(page, { slug: "unit-converter" });
  await expect.poll(() => stored(page, "unit-converter")).toMatchObject({ gravityFrom: "Plato" });
  await page.getByLabel(/^SG/).focus();
  await expect.poll(() => stored(page, "unit-converter")).toMatchObject({ gravityFrom: "SG", gravityValue: "1.050", gravityUnitTouched: true });
  await mountGravityCalculator(page, { slug: "unit-converter", reload: true });
  await expect.poll(() => stored(page, "unit-converter")).toMatchObject({ gravityFrom: "SG", gravityValue: "1.050" });
  await page.getByLabel(/^°Bx/).focus();
  await expect.poll(() => stored(page, "unit-converter")).toMatchObject({ gravityFrom: "Brix", gravityValue: "12.4" });
});

test("конвертер: сохранённый выбор GP остаётся ручным и пустой ввод не превращается в ноль", async ({ page }) => {
  await mountGravityCalculator(page, { slug: "unit-converter", storedState: { gravityFrom: "points", gravityValue: "50" } });
  await expect.poll(() => stored(page, "unit-converter")).toMatchObject({ gravityFrom: "points", gravityValue: "50", gravityUnitTouched: true });
  await page.getByLabel(/^°P/).fill("");
  await page.getByLabel(/^SG/).focus();
  await expect(page.getByLabel(/^SG/)).toHaveValue("");
  await expect(page.getByLabel(/^°Bx/)).toHaveValue("");
});

test("конвертер: ссылка с явным SG и сброс учитывают профиль без смены смысла числа", async ({ page }) => {
  await mountGravityCalculator(page, { slug: "unit-converter", unit: "brix", query: "group=gravity&from=SG&value=1.060" });
  await expect.poll(() => stored(page, "unit-converter")).toMatchObject({ gravityFrom: "SG", gravityValue: "1.060", gravityUnitTouched: true });
  await page.getByRole("tab", { name: "Цвет", exact: true }).click();
  await page.getByRole("button", { name: "Сбросить", exact: true }).click();
  await expect(page.getByRole("tab", { name: "Цвет", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect.poll(() => stored(page, "unit-converter")).toMatchObject({ gravityFrom: "Brix", gravityValue: "12.4" });
});

for (const unit of ["plato", "brix", "sg"] as const) {
  test(`наклейки: поля и подписи учитывают профиль ${unit}`, async ({ page }) => {
    await mountGravityCalculator(page, { view: "labels", unit });
    await expect(page.getByLabel("Начальная плотность", { exact: true })).toHaveValue(unit === "sg" ? "1.050" : "12.4");
    await expect(page.getByRole("group", { name: "Шкала плотности этикетки" }).getByRole("button", { name: unit === "sg" ? "SG" : "°P", exact: true })).toHaveAttribute("aria-pressed", "true");
  });
}

test("наклейки: выбор пересчитывает поля и восстанавливается при новом открытии", async ({ page }) => {
  await mountGravityCalculator(page, { view: "labels" });
  await page.getByRole("group", { name: "Шкала плотности этикетки" }).getByRole("button", { name: "SG", exact: true }).click();
  await expect(page.getByLabel("Начальная плотность", { exact: true })).toHaveValue("1.050");
  await expect(page.getByLabel("Конечная плотность", { exact: true })).toHaveValue("1.012");
  await mountGravityCalculator(page, { view: "labels" });
  await expect(page.getByLabel("Начальная плотность", { exact: true })).toHaveValue("1.050");
  await expect(page.getByRole("group", { name: "Шкала плотности этикетки" }).getByRole("button", { name: "SG", exact: true })).toHaveAttribute("aria-pressed", "true");
});

test("наклейки: шкала из ссылки переводит дефолты, оставляя явные значения в их шкале", async ({ page }) => {
  await mountGravityCalculator(page, { view: "labels", query: "gravityUnit=sg&og=1.060" });
  await expect(page.getByLabel("Начальная плотность", { exact: true })).toHaveValue("1.060");
  await expect(page.getByLabel("Конечная плотность", { exact: true })).toHaveValue("1.012");
});

test("наклейки: ссылка с правкой °P не интерпретируется как SG у другого профиля", async ({ page }) => {
  await mountGravityCalculator(page, { view: "labels" });
  await page.getByLabel("Начальная плотность", { exact: true }).fill("13.0");
  await page.getByLabel("Конечная плотность", { exact: true }).focus();
  await expect.poll(() => new URL(page.url()).searchParams.get("gravityUnit")).toBe("plato");
  const query = new URL(page.url()).searchParams.toString();
  await mountGravityCalculator(page, { view: "labels", unit: "sg", query });
  await expect(page.getByLabel("Начальная плотность", { exact: true })).toHaveValue("13.0");
  await expect(page.getByLabel("Конечная плотность", { exact: true })).toHaveValue("3.1");
});

test("журнал: смена настройки пересчитывает незавершённый замер перед отправкой", async ({ page }) => {
  await mountGravityCalculator(page, { view: "journal" });
  await page.getByLabel("Плотность, °P", { exact: true }).fill("12,4");
  await page.evaluate(() => (window as unknown as { changeGravityInputUnit: (unit: string) => void }).changeGravityInputUnit("sg"));
  await expect(page.getByLabel("Плотность, SG", { exact: true })).toHaveValue("1.050");
  await page.getByRole("button", { name: "Добавить", exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { gravitySubmittedMeasurements: Array<{ gravitySg: string }> }).gravitySubmittedMeasurements[0]?.gravitySg)).toBe("1.05");
});

for (const unit of ["plato", "brix", "sg"] as const) {
  const label = unit === "sg" ? "SG" : unit === "brix" ? "°Bx" : "°P";
  test(`журнал: профиль ${unit} задаёт шкалу, шаг и подсказку`, async ({ page }) => {
    await mountGravityCalculator(page, { view: "journal", unit });
    const input = page.getByLabel(`Плотность, ${label}`, { exact: true });
    await expect(input).toHaveAttribute("step", unit === "sg" ? "0.001" : "0.1");
    await expect(input).toHaveAttribute("placeholder", unit === "sg" ? "1.050" : "12.4");
  });
  test(`ручная КП: профиль ${unit} задаёт шкалу и шаг`, async ({ page }) => {
    await mountGravityCalculator(page, { view: "manual-fg", unit });
    await page.getByRole("button", { name: "Открыть настройки КП" }).click();
    const input = page.getByLabel(`Плотность КП, ${label}`, { exact: true });
    await expect(input).toHaveAttribute("step", unit === "sg" ? "0.001" : "0.1");
    await expect(input).toHaveAttribute("placeholder", unit === "sg" ? "1.012" : "3.1");
  });
}

test("ручная КП: смена настройки пересчитывает незавершённый ввод, сохраняя замер", async ({ page }) => {
  await mountGravityCalculator(page, { view: "manual-fg" });
  await page.getByRole("button", { name: "Открыть настройки КП" }).click();
  const input = page.getByLabel(/Плотность КП/);
  await input.fill("2,5");
  await page.evaluate(() => (window as unknown as { changeGravityInputUnit: (unit: string) => void }).changeGravityInputUnit("sg"));
  await expect(input).toHaveValue("1.010");
  await page.getByRole("button", { name: "Закрыть настройки КП" }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { gravityManualFgValue: number }).gravityManualFgValue)).toBeCloseTo(1.01, 4);
});
