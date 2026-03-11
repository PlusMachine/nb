import { getServerEnv } from "./env";

import {
  assertRateLimit,
  completeEmailSignIn,
  consumeVerification,
  createSession,
  getUserBySessionToken,
  issueVerification,
  linkOAuthAccount,
  revokeSession,
  setPassword,
  signInWithPassword,
  updateProfile,
  type UserRole
} from "@nb/auth";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";


const SESSION_COOKIE = "nb_session";

export const roleWeights: Record<UserRole, number> = { user: 1, editor: 2, moderator: 3, admin: 4 };

export const hasRequiredRole = (current: UserRole, required: UserRole) => roleWeights[current] >= roleWeights[required];

export const getSessionUser = async () => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) {
    return null;
  }
  return getUserBySessionToken(token);
};

export const requireUser = async () => {
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }
  return user;
};

export const requireRole = async (role: UserRole) => {
  const user = await requireUser();
  if (!hasRequiredRole(user.role, role)) {
    redirect("/app");
  }
  return user;
};

export const startEmailOtp = async (email: string) => {
  await assertRateLimit(email.toLowerCase(), "otp", 5, 10 * 60);
  const verification = await issueVerification({ email, type: "otp" });
  console.info("[auth] OTP token", verification);
};

export const verifyEmailOtp = async (email: string, code: string) => {
  await consumeVerification({ email, token: code, type: "otp" });
  const user = await completeEmailSignIn({ email });
  await establishSession(user.id);
};

export const startMagicLink = async (email: string) => {
  await assertRateLimit(email.toLowerCase(), "magic_link", 5, 10 * 60);
  const env = getServerEnv();
  const verification = await issueVerification({ email, type: "magic_link" });
  const link = `${env.APP_URL}/api/auth/magic/consume?email=${encodeURIComponent(verification.email)}&token=${verification.rawToken}`;
  console.info("[auth] Magic link", { ...verification, link });
};

export const consumeMagicLink = async (email: string, token: string) => {
  await consumeVerification({ email, token, type: "magic_link" });
  const user = await completeEmailSignIn({ email });
  await establishSession(user.id);
};

export const establishSession = async (userId: string) => {
  const cookieStore = await cookies();
  const headerStore = await headers();
  const { rawToken, expiresAt } = await createSession({
    userId,
    ipAddress: headerStore.get("x-forwarded-for") ?? "local",
    userAgent: headerStore.get("user-agent")
  });

  cookieStore.set(SESSION_COOKIE, rawToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt
  });
};

export const logout = async () => {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) {
    await revokeSession(token);
  }
  cookieStore.delete(SESSION_COOKIE);
};

export const passwordLogin = async (email: string, password: string) => {
  const user = await signInWithPassword({ email, password });
  await establishSession(user.id);
};

export const passwordSignup = async (email: string, password: string) => {
  await setPassword({ email, password });
  await passwordLogin(email, password);
};

export const requestPasswordReset = async (email: string) => {
  await assertRateLimit(email.toLowerCase(), "password_reset", 3, 10 * 60);
  const env = getServerEnv();
  const verification = await issueVerification({ email, type: "password_reset" });
  const link = `${env.APP_URL}/login?email=${encodeURIComponent(verification.email)}&flow=reset&token=${verification.rawToken}`;
  console.info("[auth] Password reset", { ...verification, link });
};

export const resetPassword = async (email: string, token: string, password: string) => {
  await consumeVerification({ email, token, type: "password_reset" });
  await setPassword({ email, password });
  await passwordLogin(email, password);
};

export const updateCurrentProfile = async (displayName: string) => {
  const user = await requireUser();
  return updateProfile({ userId: user.id, displayName });
};

export const oauthFinalize = async (payload: {
  provider: "google" | "vk" | "yandex";
  providerAccountId: string;
  email: string;
  displayName?: string;
  image?: string;
  accessToken?: string;
  refreshToken?: string;
}) => {
  const user = await linkOAuthAccount(payload);
  await establishSession(user.id);
  return user;
};
