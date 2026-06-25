import { SiteHeader } from "@/components/shared/site-header";
import { getSessionUser } from "@/lib/auth";

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();

  return (
    <div className="min-h-screen">
      <SiteHeader user={user ? { email: user.email, displayName: user.displayName } : null} variant="public" />
      <div className="mx-auto max-w-7xl px-6 pb-12">{children}</div>
    </div>
  );
}
