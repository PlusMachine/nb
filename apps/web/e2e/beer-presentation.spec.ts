import { expect, test, type Page } from "@playwright/test";

// Вёрстка гостевой страницы пива (/beer/<slug>). Регресс на две поломки первой
// версии: маркер шкалы «Цвет» у чёрного пива (SRM 45 → 100 %) вылезал за плитку,
// а страница занимала 2 экрана вместо одного из-за раздутого hero.
//
// Пиво разного цвета — граничные случаи шкал: стаут упирает шкалу цвета в 100 %,
// пилснер прижимает к 0 %, IPA даёт длинную подпись цвета в узкой колонке.
const BEERS = [
  { slug: "sample-american-stout", title: "стаут (SRM на максимуме шкалы)" },
  { slug: "pilsner-urquell", title: "пилснер (светлый, шкалы у нуля)" },
  { slug: "bell-s-two-hearted-ale", title: "IPA (среднее по всем шкалам)" }
];

const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

// Куки-баннер — оверлей на пол-экрана: он перекрывает контент и ломает замеры
// геометрии. Гость, уже сделавший выбор, его не видит — воспроизводим это.
const acceptCookies = async (page: Page) => {
  await page.context().addCookies([
    { name: "nb_cookie_consent", value: "1:all", url: BASE_URL },
    { name: "nb_age_ok", value: "1", url: BASE_URL }
  ]);
};

/** Элементы, чей бокс вышел за бокс родителя (родитель без своего скролла). */
const findOverflowingElements = (page: Page) =>
  page.evaluate(() => {
    const bad: Array<{ tag: string; cls: string; text: string; overflowPx: number }> = [];
    for (const el of Array.from(document.querySelectorAll("article *"))) {
      const parent = el.parentElement;
      if (!parent) continue;
      if (getComputedStyle(parent).overflow !== "visible") continue;
      const box = el.getBoundingClientRect();
      const parentBox = parent.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) continue;
      const overflowPx = Math.max(box.right - parentBox.right, parentBox.left - box.left);
      if (overflowPx > 1) {
        bad.push({
          tag: el.tagName.toLowerCase(),
          cls: String(el.className).slice(0, 60),
          text: (el.textContent ?? "").trim().slice(0, 30),
          overflowPx: Math.round(overflowPx)
        });
      }
    }
    return bad;
  });

test.describe("Страница пива по QR", () => {
  for (const beer of BEERS) {
    test.describe(beer.title, () => {
      test.beforeEach(async ({ page }) => {
        await acceptCookies(page);
        await page.goto(`/beer/${beer.slug}`);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      });

      test("контент не вылезает за свои блоки (шкалы, длинные названия цвета)", async ({ page }) => {
        expect(await findOverflowingElements(page)).toEqual([]);
      });

      test("нет горизонтального скролла", async ({ page }) => {
        const { scrollWidth, clientWidth } = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth
        }));
        expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
      });

      test("сцена помещается в экран — вертикального скролла нет", async ({ page }) => {
        const { scrollHeight, innerHeight } = await page.evaluate(() => ({
          scrollHeight: document.documentElement.scrollHeight,
          innerHeight: window.innerHeight
        }));
        // Допуск на субпиксель/скроллбар — но не на «ещё чуть-чуть контента внизу».
        expect(scrollHeight).toBeLessThanOrEqual(innerHeight + 2);
      });

      test("главное видно без прокрутки: имя, паспорт, ссылка на рецепт", async ({ page }) => {
        await expect(page.getByRole("heading", { level: 1 })).toBeInViewport();
        // Заголовки плиток паспорта (dt), а не любое вхождение слова: «горечь» и
        // «цвет» встречаются и в описании пива.
        for (const label of ["Крепость", "Горечь", "Цвет"]) {
          await expect(page.locator("dt", { hasText: new RegExp(`^${label}$`) })).toBeInViewport();
        }
        await expect(page.getByRole("link", { name: "Рецепт этого пива" })).toBeInViewport();
      });
    });
  }

  test("маркер шкалы цвета у чёрного пива не выходит за трек", async ({ page }) => {
    await acceptCookies(page);
    await page.goto("/beer/sample-american-stout");

    const colorTile = page.locator("div", { has: page.locator("dt", { hasText: /^Цвет$/ }) }).last();
    const track = colorTile.locator("div.relative.rounded-full");
    const marker = track.locator("span");

    const trackBox = await track.boundingBox();
    const markerBox = await marker.boundingBox();
    expect(trackBox).not.toBeNull();
    expect(markerBox).not.toBeNull();
    // Шкала упёрта в максимум — маркер должен встать у правого края ВНУТРИ трека.
    expect(markerBox!.x + markerBox!.width).toBeLessThanOrEqual(trackBox!.x + trackBox!.width + 1);
    expect(markerBox!.x).toBeGreaterThanOrEqual(trackBox!.x - 1);
  });
});
