import crypto from "node:crypto";
import { getOAuthProviders, type OAuthProviderId } from "@nb/auth";
import { cookies } from "next/headers";

import { getServerEnv } from "./env";

const STATE_COOKIE_PREFIX = "nb_oauth_state_";

type ProviderId = OAuthProviderId;

const getProvider = (providerId: ProviderId) => {
  const env = getServerEnv();
  const provider = getOAuthProviders(env).find((item) => item.id === providerId);
  if (!provider?.clientId || !provider.clientSecret) {
    throw new Error("OAUTH_PROVIDER_NOT_CONFIGURED");
  }
  return { provider, env };
};

export const buildAuthorizationUrl = async (providerId: ProviderId) => {
  const { provider, env } = getProvider(providerId);
  const state = crypto.randomBytes(12).toString("hex");
  const callback = `${env.APP_URL}/api/auth/oauth/${providerId}/callback`;
  const params = new URLSearchParams({
    client_id: provider.clientId!,
    redirect_uri: callback,
    response_type: "code",
    scope: provider.scope,
    state
  });

  const cookieStore = await cookies();
  cookieStore.set(`${STATE_COOKIE_PREFIX}${providerId}`, state, {
    path: "/",
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: 15 * 60
  });

  return `${provider.authUrl}?${params.toString()}`;
};

export const consumeOAuthCallback = async (providerId: ProviderId, state: string, code: string) => {
  const { provider, env } = getProvider(providerId);
  const cookieStore = await cookies();
  const expected = cookieStore.get(`${STATE_COOKIE_PREFIX}${providerId}`)?.value;
  if (!expected || expected !== state) {
    throw new Error("INVALID_OAUTH_STATE");
  }
  cookieStore.delete(`${STATE_COOKIE_PREFIX}${providerId}`);

  const callback = `${env.APP_URL}/api/auth/oauth/${providerId}/callback`;
  const tokenResponse = await fetch(provider.tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: provider.clientId!,
      client_secret: provider.clientSecret!,
      redirect_uri: callback
    })
  });

  if (!tokenResponse.ok) {
    throw new Error("OAUTH_TOKEN_FAILED");
  }

  const tokenJson = await tokenResponse.json();
  const accessToken = tokenJson.access_token as string | undefined;
  if (!accessToken) {
    throw new Error("OAUTH_ACCESS_TOKEN_MISSING");
  }

  const userInfoResponse = await fetch(provider.userInfoUrl, {
    headers: {
      authorization: `Bearer ${accessToken}`
    }
  });

  if (!userInfoResponse.ok) {
    throw new Error("OAUTH_USERINFO_FAILED");
  }

  const userInfo = await userInfoResponse.json();

  const profile =
    providerId === "vk"
      ? {
          id: userInfo.user?.user_id ?? userInfo.sub ?? userInfo.id,
          email: userInfo.user?.email ?? userInfo.email,
          name: userInfo.user?.first_name ? `${userInfo.user.first_name} ${userInfo.user.last_name ?? ""}`.trim() : userInfo.name,
          image: userInfo.user?.avatar ?? undefined
        }
      : {
          id: userInfo.id ?? userInfo.sub,
          email: userInfo.default_email ?? userInfo.email,
          name: userInfo.real_name ?? userInfo.name,
          image: userInfo.picture ?? userInfo.avatar_id
        };

  if (!profile.id || !profile.email) {
    throw new Error("OAUTH_EMAIL_REQUIRED");
  }

  return {
    provider: providerId,
    providerAccountId: String(profile.id),
    email: String(profile.email),
    displayName: String(profile.name ?? profile.email),
    image: profile.image ? String(profile.image) : undefined,
    accessToken,
    refreshToken: tokenJson.refresh_token as string | undefined
  };
};
