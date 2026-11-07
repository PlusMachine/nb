import type { Metadata } from "next";

import { OfflineConsoleList } from "./offline-console-list";
import { OfflineRetryButton } from "./offline-retry-button";
import { OfflineBrewAccess } from "./offline-brew-access";

// ============================================================================
// Страница «Нет сети».
//
// Отдаётся service worker'ом (/sw.js) из кэша при обрыве навигации, поэтому
// должна быть полностью самодостаточной: глобальный CSS (globals.css) к моменту
// показа может быть не закэширован, поэтому вся критичная вёрстка — на инлайн
// <style> ниже, без Tailwind-классов. Поддержка тёмной темы — и через системную
// prefers-color-scheme, и через класс `dark` на <html> (см. features/theme/theme.ts:
// themeInitScript уже применяет его до пейнта, если страница пришла из кэша вместе
// с корневым layout).
//
// Страница гидрируется React'ом (общий root layout с Providers), поэтому кнопка
// «Повторить» и список локальных пультов приборов — обычные клиентские компоненты
// (offline-retry-button.tsx, offline-console-list.tsx), а не инлайн-скрипты:
// мутация DOM инлайн-скриптом до гидратации ловила hydration mismatch (React
// выбрасывал добавленные скриптом узлы, фича не работала никогда). Нужные для
// гидратации чанки precache'ит /sw.js.
// ============================================================================

export const metadata: Metadata = {
  title: "Нет сети",
  robots: { index: false }
};

function OfflineFallback() {
  return (
    <div className="offline-page">
      <style>{`
        .offline-page {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
          background: #f4f4f6;
          color: #0a0a0c;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        }
        .offline-card {
          width: 100%;
          max-width: 420px;
          background: #ffffff;
          border: 1px solid #e4e4e7;
          border-radius: 16px;
          padding: 32px 28px;
          text-align: center;
        }
        .offline-icon {
          font-size: 40px;
          line-height: 1;
          margin-bottom: 16px;
        }
        .offline-title {
          margin: 0 0 8px;
          font-size: 22px;
          font-weight: 700;
        }
        .offline-text {
          margin: 0 0 20px;
          font-size: 15px;
          line-height: 1.5;
          color: #6b6b76;
        }
        .offline-button {
          appearance: none;
          border: none;
          border-radius: 10px;
          padding: 12px 24px;
          font-size: 15px;
          font-weight: 600;
          color: #ffffff;
          background: #047857;
          cursor: pointer;
        }
        .offline-button:hover {
          background: #036c50;
        }
        .offline-device {
          margin-top: 28px;
          padding-top: 20px;
          border-top: 1px solid #e4e4e7;
          text-align: left;
        }
        .offline-device-title {
          margin: 0 0 6px;
          font-size: 14px;
          font-weight: 600;
        }
        .offline-device-list {
          margin: 0 0 12px;
          padding: 0;
          list-style: none;
        }
        .offline-device-list li {
          margin: 0 0 6px;
        }
        .offline-device-link {
          color: #047857;
          font-weight: 600;
          text-decoration: none;
        }
        .offline-device-link:hover {
          text-decoration: underline;
        }
        .offline-device-fallback code {
          background: #f4f4f6;
          border-radius: 4px;
          padding: 1px 5px;
        }

        @media (prefers-color-scheme: dark) {
          :root:not([style*="color-scheme"]) .offline-page { background: #09090b; color: #f4f4f6; }
          :root:not([style*="color-scheme"]) .offline-card { background: #17171b; border-color: #2c2c33; }
          :root:not([style*="color-scheme"]) .offline-text { color: #9d9da8; }
          :root:not([style*="color-scheme"]) .offline-button { background: #10b981; color: #052e1f; }
          :root:not([style*="color-scheme"]) .offline-button:hover { background: #34d399; }
          :root:not([style*="color-scheme"]) .offline-device { border-top-color: #2c2c33; }
          :root:not([style*="color-scheme"]) .offline-device-link { color: #34d399; }
          :root:not([style*="color-scheme"]) .offline-device-fallback code { background: #232329; }
        }
        :root.dark .offline-page { background: #09090b; color: #f4f4f6; }
        :root.dark .offline-card { background: #17171b; border-color: #2c2c33; }
        :root.dark .offline-text { color: #9d9da8; }
        :root.dark .offline-button { background: #10b981; color: #052e1f; }
        :root.dark .offline-button:hover { background: #34d399; }
        :root.dark .offline-device { border-top-color: #2c2c33; }
        :root.dark .offline-device-link { color: #34d399; }
        :root.dark .offline-device-fallback code { background: #232329; }
      `}</style>

      <div className="offline-card">
        <div className="offline-icon" aria-hidden="true">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ display: "inline-block" }}>
            <path d="m2 2 20 20M8.5 16.5a5 5 0 0 1 7 0M5 13a10 10 0 0 1 2.5-1.8M11 10a10 10 0 0 1 8 3M2 9a15 15 0 0 1 2-1.5M8 5.5A15 15 0 0 1 22 9" />
            <circle cx="12" cy="20" r=".5" />
          </svg>
        </div>
        <h1 className="offline-title">Нет соединения</h1>
        <p className="offline-text">Проверьте интернет и попробуйте ещё раз.</p>
        <OfflineRetryButton />

        <div className="offline-device">
          <p className="offline-device-title">Пивоварня рядом?</p>
          <p className="offline-text">
            Если прибор в той же Wi-Fi-сети, он работает без интернета — откройте его локальный пульт.
          </p>
          <OfflineConsoleList />
        </div>
      </div>
    </div>
  );
}

export default function OfflinePage() {
  return (
    <div data-nb-offline-shell>
      <OfflineBrewAccess><OfflineFallback /></OfflineBrewAccess>
    </div>
  );
}
