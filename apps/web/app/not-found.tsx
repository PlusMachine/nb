import Link from "next/link";

const links = [
  { href: "/", label: "Главная" },
  { href: "/recipes", label: "Рецепты" },
  { href: "/catalog", label: "Каталог ингредиентов" },
  { href: "/calculators", label: "Калькуляторы" },
  { href: "/bjcp", label: "Стили BJCP" }
];

export default function NotFound() {
  return (
    <main className="flex min-h-[70vh] flex-col items-center justify-center gap-6 px-6 py-16 text-center">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold text-foreground">Страница не найдена</h1>
        <p className="text-sm text-muted-foreground">Такой страницы нет — возможно, ссылка устарела или в адресе опечатка.</p>
      </div>
      <nav className="flex flex-wrap items-center justify-center gap-3">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="inline-flex items-center rounded-full border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            {link.label}
          </Link>
        ))}
      </nav>
    </main>
  );
}
