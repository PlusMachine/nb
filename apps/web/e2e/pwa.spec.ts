import { expect, test } from "@playwright/test";

// PWA-регресс против prod-сборки (see e2e/pwa-prod.config.ts): манифест/иконки,
// активация service worker'а (public/sw.js) и оффлайн-фолбэк /offline. В next dev
// SW не регистрируется вовсе (features/pwa/use-service-worker.ts) — поэтому
// прогон имеет смысл только на `next build && next start`, сервер поднимает
// вызывающая сторона.

type ManifestIcon = {
  src: string;
  purpose?: string;
};

test.describe("PWA-манифест", () => {
  test("манифест и иконки", async ({ request }) => {
    const manifestResponse = await request.get("/manifest.webmanifest");
    expect(manifestResponse.status()).toBe(200);

    const manifest = (await manifestResponse.json()) as {
      start_url: string;
      icons: ManifestIcon[];
    };

    // Стартовая точка PWA — дашборд /app, не витрина (app/manifest.ts).
    expect(manifest.start_url).toBe("/app");
    expect(manifest.icons.length).toBeGreaterThanOrEqual(4);
    expect(manifest.icons.some((icon) => icon.purpose === "maskable")).toBe(true);

    for (const icon of manifest.icons) {
      const iconResponse = await request.get(icon.src);
      expect(iconResponse.status(), `иконка ${icon.src} должна отдаваться`).toBe(200);
    }

    // apple-icon.png — отдельный спец-файл Next.js (app/apple-icon.png), в manifest.icons не входит,
    // но нужен для «Добавить на экран Домой» из Safari/iOS.
    const appleIconResponse = await request.get("/apple-icon.png");
    expect(appleIconResponse.status()).toBe(200);
  });
});

test.describe("PWA offline-слой", () => {
  // (b) и (c) объединены в один тест: активный контроллер service worker'а —
  // предпосылка оффлайн-фолбэка (кэш /offline прогревается в install/activate SW,
  // см. public/sw.js), поэтому сценарий (c) без (b) не имеет смысла проверять изолированно.
  test("SW берёт под контроль страницы, а оффлайн-навигация отдаёт /offline со ссылкой на локальный пульт", async ({
    page,
    context
  }) => {
    await test.step("service worker активируется и берёт контроль без перезагрузки", async () => {
      await page.goto("/");
      // Наш SW делает skipWaiting() + clients.claim() в install/activate — контроллер
      // должен появиться у уже открытой вкладки без ручного reload.
      await page.waitForFunction(() => navigator.serviceWorker?.controller != null, undefined, {
        timeout: 20_000
      });
    });

    await test.step("оффлайн-навигация показывает /offline со ссылкой на локальный пульт прибора", async () => {
      // Контракт ключа/формы — features/pwa/device-local-console.ts (пишет пульт устройства),
      // читает app/offline/page.tsx (инлайн-скрипт DEVICES_SCRIPT).
      await page.evaluate(() => {
        window.localStorage.setItem(
          "nb_device_local_urls",
          JSON.stringify([{ id: "d1", name: "Пивоварня на кухне", url: "http://192.168.0.50" }])
        );
      });

      await context.setOffline(true);
      try {
        // Реальный сетевой fetch внутри SW тоже режется offline-режимом контекста,
        // поэтому navigate-обработчик SW уходит в catch и отдаёт закэшированный /offline.
        await page.goto("/calculators");

        await expect(page.getByRole("heading", { name: "Нет соединения" })).toBeVisible();

        const deviceLink = page.getByRole("link", { name: "Пивоварня на кухне", exact: true });
        await expect(deviceLink).toBeVisible();
        await expect(deviceLink).toHaveAttribute("href", "http://192.168.0.50/ui");

        if (process.env.PWA_SHOT_DIR) {
          await page.screenshot({
            path: `${process.env.PWA_SHOT_DIR}/offline-fallback.png`,
            fullPage: true
          });
        }
      } finally {
        await context.setOffline(false);
      }
    });
  });
});
