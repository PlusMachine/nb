import Link from "next/link";

// CTA-блок витрины /masters (§6 ТЗ): служит и «подвалом» списка, и главным
// элементом пустого состояния (0 мастеров). Ссылка ведёт на /app/master —
// анонима там встретит серверный гейт логина (?next=), сам гейт — не наша зона.
export function MasterShowcaseCta() {
  return (
    <section className="flex flex-col items-start gap-4 rounded-2xl border border-dashed border-border bg-card p-6 sm:flex-row sm:items-center sm:justify-between">
      <h2 className="text-lg font-semibold text-foreground">Делаете оборудование своими руками?</h2>
      <Link
        href="/app/master"
        className="inline-flex h-11 shrink-0 items-center justify-center rounded-xl bg-foreground px-5 text-sm font-medium text-background transition hover:bg-foreground/90"
      >
        Открыть свою витрину
      </Link>
    </section>
  );
}
