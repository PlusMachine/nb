import Link from "next/link";

export default function HomePage() {
  return (
    <section className="space-y-4">
      <h1 className="text-3xl font-semibold">NB Platform Foundation</h1>
      <p className="text-zinc-600">Stage 1 auth/access base is ready for modular-monolith feature development.</p>
      <div className="flex gap-3">
        <Link className="underline" href="/login">Login</Link>
        <Link className="underline" href="/app">App zone</Link>
        <Link className="underline" href="/admin">Admin zone</Link>
      </div>
    </section>
  );
}
