import { Search, SlidersHorizontal } from "lucide-react";

type Props = {
  query?: string;
  hasFilters?: boolean;
  onReset?: () => void;
};

export function BjcpEmptyState({ query = "", hasFilters = false, onReset }: Props) {
  const title = query
    ? "По запросу ничего не найдено"
    : hasFilters
    ? "Под выбранные фильтры ничего не подошло"
    : "Пока нечего показать";
  const description = query
    ? `Не нашли подходящий стиль для «${query}». Попробуйте код BJCP, английское название или снимите часть ограничений.`
    : hasFilters
    ? "Фильтры слишком сильно сузили каталог. Сбросьте текущие ограничения или выберите другой сценарий поиска."
    : "Выберите семейство, раскройте BJCP-категорию или начните поиск по названию и коду.";
  const Icon = query ? Search : SlidersHorizontal;

  return (
    <section className="flex flex-col items-center gap-3 rounded-[2rem] border border-dashed border-zinc-300 bg-zinc-50/60 px-6 py-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-zinc-100">
        <Icon className="h-6 w-6 text-zinc-400" />
      </div>
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-zinc-900">{title}</h2>
        <p className="max-w-xl text-sm leading-7 text-zinc-500">{description}</p>
      </div>

      {hasFilters && onReset ? (
        <button
          type="button"
          onClick={onReset}
          className="mt-2 rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 transition hover:border-zinc-300 hover:bg-zinc-100"
        >
          Сбросить фильтры
        </button>
      ) : null}
    </section>
  );
}
