import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getSessionUser } from "@/lib/auth";

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

  return <LoginForm />;
}
