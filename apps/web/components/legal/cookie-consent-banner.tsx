"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { Button } from "@nb/ui";

import type { CookieConsent } from "@/lib/consent";

const COOKIE_BANNER_HEIGHT_VAR = "--nb-cookie-banner-h";

// Неблокирующая полоса согласия внизу экрана. Не модалка (fixed inset-0 запрещён
// конвенцией) — обычный баннер, взаимодействие с сайтом не блокирует. При первом
// визите совмещает информационную отметку 18+ и выбор по cookie в одном действии.
// На мобильном — компактный размер (меньше отступы и текст), чтобы не перекрывать контент.
//
// z-[90]: ниже Sheet (100/101) и toast viewport (120) — баннер намеренно уходит
// под затемнение открытых модалок/шторок, но выше обычного хрома (z-40).
// bottom привязан к --nb-bottom-nav-h (пишет AppShell, вне app-зоны переменной
// нет → 0px), чтобы не перекрывать нижнюю мобильную нав-панель.
export function CookieConsentBanner({
  onDecide,
  showAgeNotice
}: {
  onDecide: (choice: CookieConsent) => void;
  showAgeNotice: boolean;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = rootRef.current;
    if (!node) return;

    const writeHeightVar = () => {
      document.documentElement.style.setProperty(COOKIE_BANNER_HEIGHT_VAR, `${node.getBoundingClientRect().height}px`);
    };

    writeHeightVar();
    const observer = new ResizeObserver(writeHeightVar);
    observer.observe(node);

    return () => {
      observer.disconnect();
      // Сброс обязателен: иначе после ответа на баннер отступ у кнопки
      // «Обратная связь» останется висеть даже без баннера на экране.
      document.documentElement.style.setProperty(COOKIE_BANNER_HEIGHT_VAR, "0px");
    };
  }, []);

  return (
    <div
      ref={rootRef}
      role="region"
      aria-label="Использование файлов cookie"
      className="fixed inset-x-0 bottom-[var(--nb-bottom-nav-h,0px)] z-[90] border-t border-border bg-card/95 px-4 py-2.5 shadow-[0_-8px_30px_rgba(0,0,0,0.08)] backdrop-blur sm:py-4"
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <div className="text-xs leading-5 text-muted-foreground sm:text-sm sm:leading-6">
          {showAgeNotice ? (
            <p className="mb-1 font-medium text-foreground">
              18+ · Материалы о домашнем пивоварении. Чрезмерное употребление алкоголя вредит вашему здоровью.
            </p>
          ) : null}
          <p>
            Мы используем cookie: обязательные — для работы сайта и входа, аналитические — чтобы улучшать сервис.
            Подробнее в{" "}
            <Link href="/legal/cookies" className="text-link underline underline-offset-4">
              Политике cookie
            </Link>
            .
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => onDecide("necessary")}>
            Только необходимые
          </Button>
          <Button type="button" size="sm" onClick={() => onDecide("all")}>
            Принять все
          </Button>
        </div>
      </div>
    </div>
  );
}
