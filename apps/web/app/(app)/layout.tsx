import Link from "next/link";

import { requireUser } from "@/lib/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  return (
    <div className="mx-auto max-w-6xl p-6">
      <header className="mb-4 flex items-center justify-between border-b pb-2 text-sm text-zinc-500">
        <span>App zone · {user.email}</span>
        <nav className="flex gap-3">
          <Link href="/app">Home</Link>
          <Link href="/app/ingredients">Мои ингредиенты</Link>
          <Link href="/app/recipes">Мои рецепты</Link>
          <Link href="/profile">Profile</Link>
          <Link href="/settings">Settings</Link>
        </nav>
      </header>
      {children}
    </div>
  );
}
