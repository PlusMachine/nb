import { requireUser } from "@/lib/auth";

export default async function ProfilePage() {
  const user = await requireUser();

  return (
    <section className="space-y-2 rounded-lg border p-4">
      <h1 className="text-xl font-semibold">Профиль</h1>
      <p>Email: {user.email}</p>
      <p>Display name: {user.displayName}</p>
      <p>Role: {user.role}</p>
    </section>
  );
}
