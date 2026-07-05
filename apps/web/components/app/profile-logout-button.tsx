"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { Button } from "@nb/ui";

// Видимый выход прямо на странице профиля: в рабочей зоне logout иначе живёт
// только в сайдбаре (на мобиле — за drawer'ом) и в дропдауне шапки, поэтому
// на самой /profile его «не видно» (UX-находка #24).
export function ProfileLogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  const handleLogout = async () => {
    setPending(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      router.push("/");
      router.refresh();
    }
  };

  return (
    <Button type="button" variant="outline" onClick={handleLogout} disabled={pending}>
      <LogOut className="mr-2 h-4 w-4" />
      {pending ? "Выходим…" : "Выйти из аккаунта"}
    </Button>
  );
}
