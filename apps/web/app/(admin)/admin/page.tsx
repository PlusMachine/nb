import Link from "next/link";

export default function AdminZonePage() {
  return (
    <div className="space-y-3 rounded-lg border p-4">
      <h1 className="text-xl font-semibold">Инструменты администратора</h1>
      <ul className="list-disc space-y-1 pl-5 text-sm">
        <li><Link className="underline" href="/admin/ingredients">Каталог ингредиентов</Link></li>
        <li><Link className="underline" href="/admin/ingredients/moderation">Очередь модерации ингредиентов</Link></li>
        <li><Link className="underline" href="/admin/ingredients/merge">Объединение дублей</Link></li>
        <li><Link className="underline" href="/admin/articles">BJCP / студия контента</Link></li>
        <li><Link className="underline" href="/admin/feedback">Обратная связь</Link></li>
        <li><Link className="underline" href="/admin/settings/currency">Курсы валют</Link></li>
      </ul>
    </div>
  );
}
