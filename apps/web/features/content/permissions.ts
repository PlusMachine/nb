import type { UserRole } from "@nb/auth";
import { redirect } from "next/navigation";

import { getSessionUser, hasRequiredRole } from "@/lib/auth";

export type ContentCapabilities = {
  canEditDrafts: boolean;
  canModerate: boolean;
  canPublish: boolean;
  canFeatureOnHome: boolean;
  canAdminister: boolean;
};

export const getContentCapabilities = (role: UserRole): ContentCapabilities => ({
  canEditDrafts: hasRequiredRole(role, "editor"),
  canModerate: hasRequiredRole(role, "moderator"),
  canPublish: hasRequiredRole(role, "moderator"),
  canFeatureOnHome: hasRequiredRole(role, "moderator"),
  canAdminister: hasRequiredRole(role, "admin")
});

export const requireContentRole = async (role: UserRole) => {
  const user = await getSessionUser();

  if (!user) {
    redirect("/login");
  }

  if (!hasRequiredRole(user.role, role)) {
    redirect("/app");
  }

  return {
    ...user,
    capabilities: getContentCapabilities(user.role)
  };
};
