import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { cookies } from "next/headers";

import "./globals.css";
import { Providers } from "../components/providers";
import { DevGuestBadge } from "@/components/shared/dev-guest-badge";
import { getSessionUser, getDevAuthState } from "@/lib/auth";
import { getServerEnv } from "@/lib/env";
import {
  SKIN_COOKIE,
  THEME_COOKIE,
  parseSkinPreference,
  parseThemePreference,
  themeInitScript
} from "@/features/theme/theme";

const bodyFont = localFont({
  src: "./fonts/Rubik-Variable.woff2",
  display: "optional",
  fallback: ["Arial", "sans-serif"],
  variable: "--font-sans",
  weight: "400 700"
});

const displayFont = localFont({
  src: "./fonts/Montserrat-Variable.woff2",
  display: "optional",
  fallback: ["Arial", "sans-serif"],
  variable: "--font-display",
  weight: "600 800"
});

// Шрифты скина «hop»: переменные подменяются в globals.css под html.skin-hop,
// компоненты продолжают ссылаться на --font-sans / --font-display.
// preload:false — скин hop опционален (дефолт classic); незачем преложать его
// шрифты всем. Браузер догрузит их лениво, когда появится класс skin-hop.
const hopBodyFont = localFont({
  src: "./fonts/Onest-Variable.woff2",
  display: "swap",
  fallback: ["Arial", "sans-serif"],
  variable: "--font-sans-hop",
  weight: "400 700",
  preload: false
});

const hopDisplayFont = localFont({
  src: "./fonts/Unbounded-Variable.woff2",
  display: "swap",
  fallback: ["Arial", "sans-serif"],
  variable: "--font-display-hop",
  weight: "500 700",
  preload: false
});

const { SITE_NAME } = getServerEnv();

export const metadata: Metadata = {
  metadataBase: new URL(getServerEnv().APP_URL),
  title: {
    default: `${SITE_NAME} — рецепты пива, калькуляторы пивовара и справочник стилей BJCP`,
    template: `%s · ${SITE_NAME}`
  },
  description:
    "Рецепты, склад ингредиентов, калькуляторы и справочник стилей BJCP для домашних пивоваров.",
  openGraph: {
    type: "website",
    locale: "ru_RU",
    siteName: SITE_NAME,
    url: "/"
  },
  twitter: {
    card: "summary_large_image"
  }
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f4f6" },
    { media: "(prefers-color-scheme: dark)", color: "#09090b" }
  ]
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [devAuth, cookieStore, sessionUser] = await Promise.all([
    getDevAuthState(),
    cookies(),
    getSessionUser()
  ]);
  const themePreference = parseThemePreference(cookieStore.get(THEME_COOKIE)?.value);
  const skinPreference = parseSkinPreference(cookieStore.get(SKIN_COOKIE)?.value);

  return (
    <html
      lang="ru"
      // Явный dark ставим уже на сервере (нет вспышки для этих пользователей);
      // режим system досогласует инлайн-скрипт до пейнта. suppressHydrationWarning
      // гасит расхождение класса между сервером и клиентом.
      className={`${bodyFont.variable} ${displayFont.variable} ${hopBodyFont.variable} ${hopDisplayFont.variable}${themePreference === "dark" ? " dark" : ""}${skinPreference === "hop" ? " skin-hop" : ""}`}
      suppressHydrationWarning
    >
      <body className="min-h-screen bg-background text-foreground antialiased" style={{ fontFamily: "var(--font-sans)" }}>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <Providers
          initialThemePreference={themePreference}
          initialSkinPreference={skinPreference}
          isAuthenticated={Boolean(sessionUser)}
        >
          <div className="flex min-h-screen flex-col">
            <div className="flex-1">{children}</div>
          </div>
          <DevGuestBadge active={devAuth.isGuest} accounts={devAuth.accounts} activeEmail={devAuth.activeEmail} />
        </Providers>
      </body>
    </html>
  );
}
