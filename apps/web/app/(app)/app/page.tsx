import Link from "next/link";

export default function AppZonePage() {
  return (
    <div className="space-y-2 rounded-lg border p-4">
      <p>Feature modules will be mounted here.</p>
      <div className="flex gap-3 text-sm underline">
        <Link href="/profile">Профиль</Link>
        <Link href="/settings">Настройки</Link>
      </div>
    </div>
  );
}
