import Link from "next/link";

// 404 гостевой страницы пива: сюда попадают по напечатанному QR, поэтому тон —
// той же тёмной сцены, а не сайтовый layout (группа (present) без хрома).

export default function BeerNotFound() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-[#0e0c0a] px-6 text-center text-white">
      <p className="text-xs font-medium uppercase tracking-[0.28em] text-white/50">404</p>
      <h1 className="mt-3 text-3xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
        Такой страницы нет
      </h1>
      <p className="mt-3 max-w-sm text-white/60">
        Ссылка с наклейки устарела или рецепт удалён.
      </p>
      <Link
        href="/"
        className="mt-8 rounded-full border border-white/25 bg-white/10 px-5 py-2.5 text-sm font-medium backdrop-blur transition-colors hover:bg-white/20"
      >
        На главную NB
      </Link>
    </div>
  );
}
