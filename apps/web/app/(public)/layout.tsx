import Link from "next/link";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-7xl items-center justify-between gap-6 border-b border-white/70 px-6 py-6">
        <Link href="/" className="text-lg font-semibold tracking-[0.2em] text-zinc-950">NB</Link>
        <nav className="flex flex-wrap items-center gap-4 text-sm text-zinc-600">
          <Link className="transition hover:text-zinc-950" href="/bjcp">BJCP</Link>
          <Link className="transition hover:text-zinc-950" href="/recipes">Рецепты</Link>
          <Link className="transition hover:text-zinc-950" href="/login">Войти</Link>
        </nav>
      </header>
      <div className="mx-auto max-w-7xl px-6 pb-12">{children}</div>
    </div>
  );
}
