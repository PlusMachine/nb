import type { UserRole } from "@nb/auth";

import { hasRequiredRole } from "@/lib/auth";

export type FeedbackCapabilities = {
  canModerate: boolean;
};

// Обратную связь модерирует moderator и выше (как очередь ингредиентов).
export const getFeedbackCapabilities = (role: UserRole): FeedbackCapabilities => ({
  canModerate: hasRequiredRole(role, "moderator")
});
