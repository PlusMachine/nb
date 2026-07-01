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
  createdAt: Date;
  updatedAt: Date;
};

export type OAuthProviderId = "vk" | "yandex";
