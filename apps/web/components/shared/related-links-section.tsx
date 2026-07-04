import React from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

export type RelatedLink = { href: string; label: string };

type RelatedLinksSectionProps = {
  links: RelatedLink[];
  title?: string;
};

// Блок «Дальше»: чипы-ссылки на следующий шаг. Общий вид для калькуляторов и
// гайдов — переиспользуем, чтобы разметка не разъезжалась между местами.
export function RelatedLinksSection({ links, title = "Дальше" }: RelatedLinksSectionProps) {
  if (links.length === 0) {
    return null;
  }

  return (
    <section className="rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-zinc-900">{title}</h2>
      <div className="mt-3 flex flex-wrap gap-2">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-600 transition-colors hover:border-zinc-300 hover:bg-zinc-50"
          >
            {link.label}
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        ))}
      </div>
    </section>
  );
}
