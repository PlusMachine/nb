import { Badge, type BadgeTone } from "@nb/ui";

import { adminUserStatusLabels, type AdminUserStatus } from "@/features/admin-users/contracts";

const statusTone: Record<AdminUserStatus, BadgeTone> = {
  active: "success",
  blocked: "danger",
  anonymized: "neutral"
};

export function UserStatusBadge({ status, size = "md" }: { status: AdminUserStatus; size?: "sm" | "md" }) {
  return (
    <Badge tone={statusTone[status]} size={size}>
      {adminUserStatusLabels[status]}
    </Badge>
  );
}
