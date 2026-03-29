import { requireContentRole } from "@/features/content/permissions";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireContentRole("editor");

  return (
    <div className="mx-auto max-w-6xl p-6">
      <header className="mb-4 border-b pb-2 text-sm text-zinc-500">Admin zone</header>
      {children}
    </div>
  );
}
