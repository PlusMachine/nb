export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-6xl p-6">
      <header className="mb-4 border-b pb-2 text-sm text-zinc-500">App zone scaffold</header>
      {children}
    </div>
  );
}
