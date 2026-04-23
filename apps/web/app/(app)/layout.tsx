import { AppRouteFeedback } from "@/components/app/app-route-feedback";
import { AppShellNavigation } from "@/components/app/app-shell-navigation";
import { requireUser } from "@/lib/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  return (
    <div className="mx-auto max-w-6xl p-6">
      <AppRouteFeedback />
      <AppShellNavigation email={user.email} />
      {children}
    </div>
  );
}
