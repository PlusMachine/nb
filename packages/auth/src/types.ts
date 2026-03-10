export const ROLES = ["user", "editor", "moderator", "admin"] as const;

export type UserRole = (typeof ROLES)[number];

export const roleWeight: Record<UserRole, number> = {
  user: 1,
  editor: 2,
  moderator: 3,
  admin: 4
};

export type AuthUser = {
  id: string;
  email: string;
  emailVerified: boolean;
  displayName: string;
  image: string | null;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
};
