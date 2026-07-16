import type { MetadataRoute } from "next";

// =====================================================================
// PWA-манифест: чтобы «на главный экран» открывался как приложение,
// а не как вкладка браузера. Стартовая точка — дашборд /app; отдельный
// киоск-режим приборов открывается по своей закладке (?kiosk=1).
// =====================================================================
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "NB",
    short_name: "NB",
    description:
      "Платформа для домашних пивоваров: каталог ингредиентов, склад, рецепты, расчёты и справочник стилей BJCP.",
    start_url: "/app",
    display: "standalone",
    // Манифест статичен (тему на лету не переключить). Основной PWA-сценарий —
    // киоск у прибора, где уместнее тёмный сплэш; совпадает с dark --background.
    background_color: "#09090b",
    theme_color: "#09090b",
    lang: "ru",
    icons: [
      {
        src: "/icon.svg",
        type: "image/svg+xml",
        sizes: "any"
      },
      {
        src: "/images/pwa/icon-192.png",
        type: "image/png",
        sizes: "192x192"
      },
      {
        src: "/images/pwa/icon-512.png",
        type: "image/png",
        sizes: "512x512"
      },
      {
        src: "/images/pwa/icon-maskable-512.png",
        type: "image/png",
        sizes: "512x512",
        purpose: "maskable"
      }
    ],
    shortcuts: [
      { name: "Устройства", url: "/app/devices" },
      { name: "Партии", url: "/app/brew-batches" },
      { name: "Склад", url: "/app/ingredients" }
    ]
  };
}
