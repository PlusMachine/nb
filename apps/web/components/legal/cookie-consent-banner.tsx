"use client";

import Link from "next/link";
import { Button } from "@nb/ui";

import type { CookieConsent } from "@/lib/consent";

// Неблокирующая полоса согласия внизу экрана. Не модалка (fixed inset-0 запрещён
// конвенцией) — обычный баннер, взаимодействие с сайтом не блокирует. При первом
// визите совмещает информационную отметку 18+ и выбор по cookie в одном действии.
export function CookieConsentBanner({
  onDecide,
  showAgeNotice
}: {
  onDecide: (choice: CookieConsent) => void;
  showAgeNotice: boolean;
}) {
  return (
    <div
      role="region"
      aria-label="Использование файлов cookie"
      className="fixed inset-x-0 bottom-0 z-[300] border-t border-zinc-200 bg-white/95 px-4 py-4 shadow-[0_-8px_30px_rgba(0,0,0,0.08)] backdrop-blur"
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm leading-6 text-zinc-600">
          {showAgeNotice ? (
            <p className="mb-1 font-medium text-zinc-900">
              18+ · Материалы о домашнем пивоварении. Чрезмерное употребление алкоголя вредит вашему здоровью.
            </p>
          ) : null}
          <p>
            Мы используем cookie: обязательные — для работы сайта и входа, аналитические — чтобы улучшать сервис.
            Подробнее в{" "}
            <Link href="/legal/cookies" className="text-sky-700 underline underline-offset-4">
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
