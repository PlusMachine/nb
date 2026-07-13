import Link from "next/link";
import { Badge } from "@nb/ui";

import { AdminDataTable, type AdminDataTableColumn } from "@/components/admin/admin-data-table";
import { AdminFilterTabs, type AdminFilterTab } from "@/components/admin/admin-filter-tabs";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { DevicesFilters } from "@/components/admin/devices/devices-filters";
import { listAdminDevices, type AdminDeviceListItem } from "@/features/devices/admin";
import { devicePresenceLabels, type DevicePresence } from "@/features/devices/contracts";
import { requireRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

const isPresence = (value: string | undefined): value is DevicePresence =>
  value === "online" || value === "offline";

const buildTabHref = (params: { q?: string; fw?: string }, presence?: DevicePresence) => {
  const search = new URLSearchParams();
  if (presence) {
    search.set("presence", presence);
  }
  if (params.q) {
    search.set("q", params.q);
  }
  if (params.fw) {
    search.set("fw", params.fw);
  }
  const query = search.toString();
  return query ? `/admin/devices?${query}` : "/admin/devices";
};

export default async function AdminDevicesPage({
  searchParams
}: {
  searchParams: Promise<{ presence?: string; fw?: string; q?: string; page?: string }>;
}) {
  await requireRole("admin");

  const { presence, fw, q, page } = await searchParams;
  const activePresence = isPresence(presence) ? presence : undefined;
  const query = q?.trim() ?? "";
  const parsedPage = Number.parseInt(page ?? "1", 10);

  const result = await listAdminDevices({
    presence: activePresence,
    fw: fw || undefined,
    query: query || undefined,
    page: Number.isFinite(parsedPage) ? parsedPage : 1
  });

  const tabs: AdminFilterTab[] = [
    { key: "all", label: "Все", href: buildTabHref({ q: query, fw }), count: result.onlineCount + result.offlineCount },
    {
      key: "online",
      label: devicePresenceLabels.online,
      href: buildTabHref({ q: query, fw }, "online"),
      count: result.onlineCount
    },
    {
      key: "offline",
      label: devicePresenceLabels.offline,
      href: buildTabHref({ q: query, fw }, "offline"),
      count: result.offlineCount
    }
  ];

  const columns: AdminDataTableColumn<AdminDeviceListItem>[] = [
    {
      key: "name",
      header: "Устройство",
      cell: (device) => (
        <div className="space-y-0.5">
          <Link href={`/admin/devices/${device.id}`} className="font-medium text-foreground hover:underline">
            {device.name}
          </Link>
          <div className="font-mono text-xs text-muted-foreground">{device.hardwareId}</div>
        </div>
      )
    },
    {
      key: "owner",
      header: "Владелец",
      cell: (device) => (
        <div className="space-y-0.5">
          <Link href={`/admin/users/${device.ownerId}`} className="text-foreground hover:underline">
            {device.ownerName}
          </Link>
          {device.ownerEmail ? <div className="text-xs text-muted-foreground">{device.ownerEmail}</div> : null}
          {device.ownerBlocked ? (
            <Badge tone="danger" size="sm">
              Заблокирован
            </Badge>
          ) : null}
        </div>
      )
    },
    {
      key: "fw",
      header: "Прошивка",
      headerClassName: "w-32",
      cell: (device) =>
        device.fw ? (
          <span className="tabular-nums">v{device.fw}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )
    },
    {
      key: "presence",
      header: "Связь",
      headerClassName: "w-40",
      cell: (device) => (
        <div className="space-y-1">
          <Badge tone={device.presence === "online" ? "success" : "neutral"} size="sm">
            {devicePresenceLabels[device.presence]}
          </Badge>
          <div className="text-xs text-muted-foreground">{device.lastContactLabel ?? "Связи не было"}</div>
        </div>
      )
    }
  ];

  return (
    <section className="space-y-4">
      <AdminPageHeader title="Устройства" />

      <AdminFilterTabs activeKey={activePresence ?? "all"} tabs={tabs} />

      <DevicesFilters query={query} fw={fw ?? ""} presence={activePresence} fwOptions={result.fwOptions} />

      <AdminDataTable
        items={result.items}
        columns={columns}
        getRowId={(device) => device.id}
        getRowLabel={(device) => device.name}
        empty={
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            {query || fw || activePresence ? "Ничего не найдено." : "Ни одного устройства не привязано."}
          </p>
        }
      />

      <AdminPagination page={result.page} totalPages={result.totalPages} total={result.total} />
    </section>
  );
}
