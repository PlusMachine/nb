import type { Metadata, Viewport } from "next";
import { Montserrat, Rubik } from "next/font/google";
import { cookies } from "next/headers";

import "./globals.css";
import { Providers } from "../components/providers";
import { DevGuestBadge } from "@/components/shared/dev-guest-badge";
import { getSessionUser, getDevAuthState } from "@/lib/auth";
import { getServerEnv } from "@/lib/env";
import { THEME_COOKIE, parseThemePreference, themeInitScript } from "@/features/theme/theme";

const bodyFont = Rubik({
  subsets: ["latin", "cyrillic"],
  variable: "--font-sans",
  weight: ["400", "500", "600", "700"]
});

const displayFont = Montserrat({
  subsets: ["latin", "cyrillic"],
  variable: "--font-display",
  weight: ["600", "700", "800"]
});

const { SITE_NAME } = getServerEnv();

export const metadata: Metadata = {
  metadataBase: new URL(getServerEnv().APP_URL),
  title: {
    default: `${SITE_NAME} — рецепты пива, калькуляторы пивовара и справочник стилей BJCP`,
    template: `%s · ${SITE_NAME}`
  },
  description:
    "Платформа для домашних пивоваров: каталог ингредиентов, склад, рецепты, расчёты и справочник стилей BJCP.",
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

  return (
    <html
      lang="ru"
      // Явный dark ставим уже на сервере (нет вспышки для этих пользователей);
      // режим system досогласует инлайн-скрипт до пейнта. suppressHydrationWarning
      // гасит расхождение класса между сервером и клиентом.
      className={`${bodyFont.variable} ${displayFont.variable}${themePreference === "dark" ? " dark" : ""}`}
      suppressHydrationWarning
    >
      <body className="min-h-screen bg-background text-foreground antialiased" style={{ fontFamily: "var(--font-sans)" }}>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <Providers initialThemePreference={themePreference} isAuthenticated={Boolean(sessionUser)}>
          <div className="flex min-h-screen flex-col">
            <div className="flex-1">{children}</div>
          </div>
          <DevGuestBadge active={devAuth.isGuest} accounts={devAuth.accounts} activeEmail={devAuth.activeEmail} />
        </Providers>
      </body>
    </html>
  );
}
