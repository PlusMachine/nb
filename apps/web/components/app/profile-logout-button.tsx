"use client";

import { useState } from "react";
import { logoutBrowserSession } from "@/features/pwa/account-session";
import { LogOut } from "lucide-react";
import { Button } from "@nb/ui";

// Видимый выход прямо на странице профиля: в рабочей зоне logout иначе живёт
// только в сайдбаре (на мобиле — за drawer'ом) и в дропдауне шапки, поэтому
// на самой /profile его «не видно» (UX-находка #24).
export function ProfileLogoutButton() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogout = async () => {
    setPending(true);
    setError(null);
    try {
      await logoutBrowserSession("/");
    } catch {
      setError("Не удалось выйти. Проверьте соединение и повторите.");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="space-y-2">
    <Button type="button" variant="outline" onClick={handleLogout} disabled={pending}>
      <LogOut className="mr-2 h-4 w-4" />
      {pending ? "Выходим…" : "Выйти из аккаунта"}
    </Button>
    {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
