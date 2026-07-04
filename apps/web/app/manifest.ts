import type { MetadataRoute } from "next";

// =====================================================================
// PWA-манифест: чтобы «на главный экран» открывался как приложение,
// а не как вкладка браузера. Стартовая точка — командный центр
// приборов BrewForge (то, что обычно закрепляют на планшете-киоске).
// =====================================================================
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "NB",
    short_name: "NB",
    start_url: "/app/devices",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    lang: "ru",
    icons: [
      {
        src: "/icon.svg",
        type: "image/svg+xml",
        sizes: "any"
      }
    ]
  };
}
