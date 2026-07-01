import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { requireContentRole } from "@/features/content/permissions";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireContentRole("editor");

  return (
    <div className="mx-auto max-w-6xl p-6">
      <header className="mb-4 flex items-center justify-between border-b pb-2 text-sm text-zinc-500">
        <span>Admin zone</span>
        <Link
          href="/app"
          className="inline-flex items-center gap-1.5 font-medium text-zinc-600 transition-colors hover:text-zinc-950"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          В приложение
        </Link>
      </header>
      {children}
    </div>
  );
}
