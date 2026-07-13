import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url))
    }
  },
  // Next.js (SWC) компилирует .tsx с automatic JSX runtime — компоненты без
  // "use client" в проекте по конвенции не импортируют React явно. Vite/esbuild
  // по умолчанию использует classic runtime (нужен React в scope), поэтому без
  // этой настройки такие компоненты падали с "React is not defined" при первом
  // же реальном рендере в тесте (см. tests/bjcp-hub-page-seo.test.ts, A8).
  esbuild: {
    jsx: "automatic"
  },
  test: {
    environment: "node",
    // tests/** — основной набор; features/** — колокированные юнит-тесты без БД
    // (brew-controller: translator + transport SSRF-гард). Обязательно с {ts,tsx}:
    // глоб только на .ts молча выкидывал тесты с JSX в теле из прогона.
    include: ["tests/**/*.test.{ts,tsx}", "features/**/*.test.{ts,tsx}"],
    // Дефолтные 5 с — не бюджет для *-pages-wiring: первый await import() Next-страницы
    // тянет за собой esbuild-транспиляцию всего графа компонентов (в изоляции ~2.5 с),
    // а под 16 воркерами на 16 ядрах это стабильно вылезало за 5 с. Ловушка не в самом
    // падении: таймаут бросает тест на полпути, его брошенный await потом добегает и
    // съедает mockResolvedValueOnce() у СЛЕДУЮЩЕГО теста — тот падал на ассерте и уводил
    // расследование в сторону. Настоящий зависший тест 20 с всё равно не переживёт.
    testTimeout: 20000,
    setupFiles: ["./vitest.setup.ts"]
  }
});
