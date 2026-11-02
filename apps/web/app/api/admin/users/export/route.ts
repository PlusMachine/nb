import { getSessionUser } from "@/lib/auth";
import { parseAdminUserFilters, resolveAdminUserStatus, adminUserStatusLabels, userRoleLabels } from "@/features/admin-users/contracts";
import { listAdminUsersForExport } from "@/features/admin-users/service";
import { csvDocument } from "@/features/product-analytics/contracts";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user || user.role !== "admin") return Response.json({ error: "FORBIDDEN" }, { status: user ? 403 : 401 });
  const filters = parseAdminUserFilters(Object.fromEntries(new URL(request.url).searchParams));
  const items = await listAdminUsersForExport(filters);
  if (items.length > 10000) return Response.json({ error: "Слишком много пользователей. Уточните фильтры: максимум 10 000 строк." }, { status: 413 });
  const date = (value: Date | string | null | undefined) => value ? new Date(value).toISOString() : "";
  return new Response(csvDocument([
    ["ID", "Имя", "E-mail", "Телефон", "Роль", "Статус", "Регистрация", "Последний визит", "Рецепты", "Партии"],
    ...items.map(row => [row.id, row.displayName, row.email, row.phone, userRoleLabels[row.role], adminUserStatusLabels[resolveAdminUserStatus(row)], date(row.createdAt), date(row.lastSeenAt), row.recipesCount, row.batchesCount])
  ]), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="users.csv"', "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}
