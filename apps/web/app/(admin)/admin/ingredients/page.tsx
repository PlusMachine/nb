import Link from "next/link";

import { requireRole } from "@/lib/auth";
import { listCatalogIngredients } from "@/features/ingredients/service";

export default async function AdminIngredientsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireRole("admin");
  const params = await searchParams;
  const page = Number(params.page ?? "1");
  const q = typeof params.q === "string" ? params.q : undefined;
  const type = typeof params.type === "string" ? params.type : undefined;
  const status = typeof params.status === "string" ? params.status as "draft" | "active" | "archived" | "merged" : undefined;

  const result = await listCatalogIngredients({ page, q, type, status });

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Ingredient catalog</h1>
        <Link href="/admin/ingredients/new" className="rounded bg-black px-3 py-2 text-sm text-white">New ingredient</Link>
      </div>
      <form className="grid grid-cols-4 gap-2 rounded border p-3 text-sm">
        <input name="q" defaultValue={q} placeholder="Search" className="rounded border p-2" />
        <input name="type" defaultValue={type} placeholder="type" className="rounded border p-2" />
        <input name="status" defaultValue={status} placeholder="status" className="rounded border p-2" />
        <button className="rounded border px-3">Apply</button>
      </form>
      <table className="w-full border text-sm">
        <thead>
          <tr className="border-b bg-zinc-50 text-left"><th className="p-2">Name</th><th className="p-2">Type</th><th className="p-2">Status</th><th className="p-2">Updated</th></tr>
        </thead>
        <tbody>
          {result.items.map((item) => (
            <tr key={item.id} className="border-b">
              <td className="p-2"><Link className="underline" href={`/admin/ingredients/${item.id}`}>{item.displayName}</Link></td>
              <td className="p-2">{item.type}</td>
              <td className="p-2">{item.status}</td>
              <td className="p-2">{item.updatedAt.toISOString().slice(0, 10)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex items-center justify-between text-sm">
        <p>Total: {result.total}</p>
        <div className="space-x-2">
          {page > 1 && <Link className="underline" href={`/admin/ingredients?page=${page - 1}`}>Prev</Link>}
          {result.page * result.pageSize < result.total && <Link className="underline" href={`/admin/ingredients?page=${page + 1}`}>Next</Link>}
        </div>
      </div>
      <Link className="text-sm underline" href="/admin/ingredients/moderation">Open moderation queue</Link>
    </section>
  );
}
