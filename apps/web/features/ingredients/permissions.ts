import { getSessionUser, hasRequiredRole } from "@/lib/auth";
import type { UserRole } from "@nb/auth";

export const requireCatalogRole = async (role: UserRole) => {
  const user = await getSessionUser();
  if (!user || !hasRequiredRole(user.role, role)) {
    throw new Error("FORBIDDEN");
  }
  return user;
};
