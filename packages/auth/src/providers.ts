import type { ServerEnv } from "@nb/shared";

import type { OAuthProviderId } from "./types";

// Только российские сервисы единого входа (152-ФЗ / поправки 2025-2026): вход через
// иностранные сервисы (Google/Apple) на российских сайтах запрещён.
export type OAuthProviderConfig = {
  id: OAuthProviderId;
  authUrl: string;
  tokenUrl: string;
  userInfoUrl: string;
  scope: string;
  clientId?: string;
  clientSecret?: string;
};

export const getOAuthProviders = (env: ServerEnv): OAuthProviderConfig[] => [
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
