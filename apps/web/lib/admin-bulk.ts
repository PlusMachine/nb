// Общий контракт частичного отказа массовых операций админки (каталог, рецепты):
// упавшие позиции едут вместе с успешной частью и не теряются за зелёным {ok:true}.
// Набор причин и подписи к ним задаёт домен, механика группировки — здесь.

export type AdminBulkFailure<Reason extends string> = { id: string; reason: Reason };
export type AdminBulkFailureGroup<Reason extends string> = { reason: Reason; ids: string[] };

/** Порядок групп — порядок причин в домене, а не порядок падений. */
export const groupAdminBulkFailures = <Reason extends string>(
  reasons: readonly Reason[],
  failures: ReadonlyArray<AdminBulkFailure<Reason>>
): AdminBulkFailureGroup<Reason>[] => (
  reasons
    .map((reason) => ({
      reason,
      ids: failures.filter((failure) => failure.reason === reason).map((failure) => failure.id)
    }))
    .filter((group) => group.ids.length > 0)
);

export const countAdminBulkFailures = <Reason extends string>(
  failed: ReadonlyArray<AdminBulkFailureGroup<Reason>>
): number => failed.reduce((total, group) => total + group.ids.length, 0);

/** «уже скрыты: 1, не найдены: 2» — хвост фразы, поэтому подпись со строчной буквы. */
export const describeAdminBulkFailures = <Reason extends string>(
  labels: Record<Reason, string>,
  failed: ReadonlyArray<AdminBulkFailureGroup<Reason>>
): string => (
  failed
    .map((group) => {
      const label = labels[group.reason];
      return `${label.charAt(0).toLowerCase()}${label.slice(1)}: ${group.ids.length}`;
    })
    .join(", ")
);
