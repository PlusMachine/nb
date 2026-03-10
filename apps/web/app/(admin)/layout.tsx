import { requireRole } from "@/lib/auth";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireRole("admin");

  return (
    <div className="mx-auto max-w-6xl p-6">
      <header className="mb-4 border-b pb-2 text-sm text-zinc-500">Admin zone scaffold</header>
      {children}
    </div>
  );
}
