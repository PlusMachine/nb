import { getOAuthProviders } from "@nb/auth";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getSessionUser } from "@/lib/auth";
import { getServerEnv } from "@/lib/env";

import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Вход",
  robots: {
    index: false,
    follow: true
  },
  alternates: {
    canonical: "/login"
  }
};

export default async function LoginPage() {
  // Залогиненному форма входа не нужна — его дом это мастерская.
  const user = await getSessionUser();
  if (user) {
    redirect("/app");
  }

  // Ключи VK ID/Яндекс ID иногда не заведены (dev/пока не выданы) — тогда кнопка
  // молча редиректит на ошибку. Считаем доступность на сервере и скрываем кнопку,
  // а не показываем нерабочий путь входа.
  const providers = getOAuthProviders(getServerEnv());
  const isProviderConfigured = (id: "vk" | "yandex") => {
    const provider = providers.find((item) => item.id === id);
    return Boolean(provider?.clientId && provider?.clientSecret);
  };

  return (
    <LoginForm
      oauth={{
        vk: isProviderConfigured("vk"),
        yandex: isProviderConfigured("yandex")
      }}
    />
  );
}
