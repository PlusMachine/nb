export const ROLES = ["user", "editor", "moderator", "admin"] as const;

export type UserRole = (typeof ROLES)[number];
export type SupportedCurrency = "RUB" | "USD" | "EUR";
export type PreferredGravityUnit = "sg" | "plato" | "brix";

export const roleWeight: Record<UserRole, number> = {
  user: 1,
  editor: 2,
  moderator: 3,
  admin: 4
};

export type AuthUser = {
  id: string;
  email: string | null;
  emailVerified: boolean;
  phone: string | null;
  phoneVerified: boolean;
  displayName: string;
  preferredCurrency: SupportedCurrency;
  preferredGravityUnit: PreferredGravityUnit;
  image: string | null;
  role: UserRole;
  /** Не null — вход запрещён (блокировка модератором). */
  blockedAt: Date | null;
  blockedReason: string | null;
  /** Не null — ПДн затёрты, строка сохранена ради ссылок и запрета перерегистрации. */
  anonymizedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type OAuthProviderId = "vk" | "yandex";
