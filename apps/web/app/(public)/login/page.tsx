import { redirect } from "next/navigation";

import { getSessionUser } from "@/lib/auth";

import { LoginForm } from "./login-form";

export default async function LoginPage() {
  // Залогиненному форма входа не нужна — его дом это мастерская.
  const user = await getSessionUser();
  if (user) {
    redirect("/app");
  }

  return <LoginForm />;
}
