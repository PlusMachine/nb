import type { ServerEnv } from "@nb/shared";

export type OAuthProviderConfig = {
  id: "google" | "vk" | "yandex";
  authUrl: string;
  tokenUrl: string;
  userInfoUrl: string;
  scope: string;
  clientId?: string;
  clientSecret?: string;
};

export const getOAuthProviders = (env: ServerEnv): OAuthProviderConfig[] => [
  {
    id: "google",
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    userInfoUrl: "https://openidconnect.googleapis.com/v1/userinfo",
    scope: "openid email profile",
    clientId: env.AUTH_GOOGLE_CLIENT_ID,
    clientSecret: env.AUTH_GOOGLE_CLIENT_SECRET
  },
  {
    id: "vk",
    authUrl: "https://id.vk.com/authorize",
    tokenUrl: "https://id.vk.com/oauth2/auth",
    userInfoUrl: "https://id.vk.com/oauth2/user_info",
    scope: "email",
    clientId: env.AUTH_VK_CLIENT_ID,
    clientSecret: env.AUTH_VK_CLIENT_SECRET
  },
  {
    id: "yandex",
    authUrl: "https://oauth.yandex.ru/authorize",
    tokenUrl: "https://oauth.yandex.ru/token",
    userInfoUrl: "https://login.yandex.ru/info",
    scope: "login:email login:info",
    clientId: env.AUTH_YANDEX_CLIENT_ID,
    clientSecret: env.AUTH_YANDEX_CLIENT_SECRET
  }
];
