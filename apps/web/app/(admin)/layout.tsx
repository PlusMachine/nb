export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-6xl p-6">
      <header className="mb-4 border-b pb-2 text-sm text-zinc-500">Admin zone scaffold</header>
      {children}
    </div>
  );
}
