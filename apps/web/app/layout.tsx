import type { Metadata } from "next";
import { Montserrat, Rubik } from "next/font/google";

import "./globals.css";
import { Providers } from "../components/providers";
import { SiteFooter } from "@/components/shared/site-footer";
import { getServerEnv } from "@/lib/env";

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

export const metadata: Metadata = {
  metadataBase: new URL(getServerEnv().APP_URL),
  title: {
    default: "NB",
    template: "%s · NB"
  },
  description: "NB editorial and brewing knowledge base."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className={`${bodyFont.variable} ${displayFont.variable}`}>
      <body className="min-h-screen bg-slate-50 text-zinc-950 antialiased" style={{ fontFamily: "var(--font-sans)" }}>
        <Providers>
          <div className="flex min-h-screen flex-col">
            <div className="flex-1">{children}</div>
            <SiteFooter />
          </div>
        </Providers>
      </body>
    </html>
  );
}
