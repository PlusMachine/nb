import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { LEGAL_DOC_EFFECTIVE_LABEL, getOperator } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Правовые документы",
  description: "Пользовательское соглашение, политика обработки персональных данных и использования cookie."
};

const DOCUMENTS = [
  {
    href: "/legal/terms",
    title: "Пользовательское соглашение",
    description: "Условия использования сайта, правила аккаунта, возрастное ограничение 18+."
  },
  {
    href: "/legal/privacy",
    title: "Политика обработки персональных данных",
    description: "Какие данные обрабатываются, с какими целями и как защищаются (152-ФЗ)."
  },
  {
    href: "/legal/consent",
    title: "Согласие на обработку персональных данных",
    description: "Текст согласия, которое пользователь даёт при регистрации."
  },
  {
    href: "/legal/cookies",
    title: "Политика использования cookie",
    description: "Какие файлы cookie используются и как управлять их настройками."
  }
];

export default function LegalIndexPage() {
  const operator = getOperator();

  return (
    <div className="mx-auto max-w-3xl py-10">
      <h1 className="text-3xl font-semibold text-zinc-950" style={{ fontFamily: "var(--font-display)" }}>
        Правовые документы
      </h1>
      <p className="mt-2 text-sm text-zinc-500">
        Сайт {operator.siteName}. Действующая редакция от {LEGAL_DOC_EFFECTIVE_LABEL}.
      </p>

      <div className="mt-8 grid gap-3">
        {DOCUMENTS.map((doc) => (
          <Link
            key={doc.href}
            href={doc.href}
            className="group flex items-start justify-between gap-4 rounded-2xl border border-zinc-200 bg-white p-5 transition-colors hover:border-zinc-300 hover:bg-zinc-50"
          >
            <div>
              <p className="font-semibold text-zinc-950">{doc.title}</p>
              <p className="mt-1 text-sm leading-6 text-zinc-500">{doc.description}</p>
            </div>
            <ArrowRight className="mt-1 h-5 w-5 shrink-0 text-zinc-300 transition-colors group-hover:text-zinc-600" />
          </Link>
        ))}
      </div>
    </div>
  );
}
