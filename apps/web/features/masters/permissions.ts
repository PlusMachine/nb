import type { UserRole } from "@nb/auth";

import { hasRequiredRole } from "@/lib/auth";

export type MasterCapabilities = {
  canModerate: boolean;
};

// Витрину мастеров модерирует moderator и выше (как обратная связь/контент).
export const getMasterCapabilities = (role: UserRole): MasterCapabilities => ({
  canModerate: hasRequiredRole(role, "moderator")
});
