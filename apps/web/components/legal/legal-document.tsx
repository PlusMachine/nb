import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { LEGAL_DOC_EFFECTIVE_LABEL, LEGAL_DOC_VERSION, type OperatorInfo } from "@/lib/legal";

// Обёртка правового документа: единая шапка (заголовок, редакция/версия), возврат к
// списку и контейнер .nb-legal с типографикой. Серверный компонент.
export function LegalDocument({
  title,
  lead,
  children
}: {
  title: string;
  lead?: ReactNode;
  children: ReactNode;
}) {
  return (
    <article className="mx-auto max-w-3xl py-10">
      <Link
        href="/legal"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" />
        Правовые документы
      </Link>
      <h1 className="mt-3 text-3xl font-semibold text-foreground" style={{ fontFamily: "var(--font-display)" }}>
        {title}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Редакция от {LEGAL_DOC_EFFECTIVE_LABEL} · версия {LEGAL_DOC_VERSION}
      </p>
      {lead ? <p className="mt-4 leading-7 text-muted-foreground">{lead}</p> : null}
      <div className="nb-legal mt-8">{children}</div>
    </article>
  );
}

// Блок реквизитов оператора ПДн — единый вид для политики, соглашения и согласия.
// Незаполненные поля показываются как явные плейсхолдеры (см. getOperator).
export function OperatorDetails({ operator }: { operator: OperatorInfo }) {
  return (
    <div className="not-prose rounded-xl border border-border bg-muted p-4 text-sm leading-7 text-muted-foreground">
      <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-[max-content,1fr]">
        <dt className="font-medium text-muted-foreground">Оператор</dt>
        <dd className="text-foreground">
          {operator.typeLabel}
          {operator.type === "ooo" ? "" : ", "}
          {operator.type === "ooo" ? ` «${operator.name}»` : operator.name}
        </dd>

        {operator.inn ? (
          <>
            <dt className="font-medium text-muted-foreground">ИНН</dt>
            <dd className="text-foreground">{operator.inn}</dd>
          </>
        ) : null}
        {operator.ogrn ? (
          <>
            <dt className="font-medium text-muted-foreground">{operator.type === "ip" ? "ОГРНИП" : "ОГРН"}</dt>
            <dd className="text-foreground">{operator.ogrn}</dd>
          </>
        ) : null}
        {operator.address ? (
          <>
            <dt className="font-medium text-muted-foreground">Адрес</dt>
            <dd className="text-foreground">{operator.address}</dd>
          </>
        ) : null}

        <dt className="font-medium text-muted-foreground">E-mail</dt>
        <dd className="text-foreground">
          {operator.emailProvided ? (
            <a href={`mailto:${operator.email}`} className="text-link underline underline-offset-4">
              {operator.email}
            </a>
          ) : (
            operator.email
          )}
        </dd>
      </dl>
    </div>
  );
}
