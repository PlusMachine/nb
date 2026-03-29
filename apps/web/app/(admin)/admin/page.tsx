import Link from "next/link";

export default function AdminZonePage() {
  return (
    <div className="space-y-3 rounded-lg border p-4">
      <h1 className="text-xl font-semibold">Admin tooling</h1>
      <ul className="list-disc space-y-1 pl-5 text-sm">
        <li><Link className="underline" href="/admin/ingredients">Ingredient catalog</Link></li>
        <li><Link className="underline" href="/admin/ingredients/moderation">Ingredient moderation queue</Link></li>
        <li><Link className="underline" href="/admin/ingredients/merge">Merge duplicates</Link></li>
        <li><Link className="underline" href="/admin/articles">BJCP / content studio</Link></li>
        <li><Link className="underline" href="/admin/settings/currency">Currency settings</Link></li>
      </ul>
    </div>
  );
}
