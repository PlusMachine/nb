import React from "react";

import { Checkbox, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@nb/ui";

export type AdminDataTableColumn<T> = {
  key: string;
  header: React.ReactNode;
  cell: (item: T) => React.ReactNode;
  // Классы ячейки/шапки — ширины колонок и выравнивание задаёт вызывающий.
  className?: string;
  headerClassName?: string;
  // Подпись строки в мобильной карточке (по умолчанию — header, если он строка).
  cardLabel?: string;
  // Не показывать колонку в мобильной карточке.
  hideOnCard?: boolean;
};

export type AdminDataTableSelection<T> = {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  isSelectable?: (item: T) => boolean;
};

type AdminDataTableProps<T> = {
  items: T[];
  columns: AdminDataTableColumn<T>[];
  getRowId: (item: T) => string;
  // Читаемое имя строки для aria-label чекбокса.
  getRowLabel?: (item: T) => string;
  // Своя мобильная карточка вместо дефолтной (первая колонка — шапка, остальные — строки).
  renderCard?: (item: T) => React.ReactNode;
  // Выбор строк для массовых действий; состояние живёт у вызывающего.
  selection?: AdminDataTableSelection<T>;
  empty?: React.ReactNode;
  className?: string;
};

const resolveCardLabel = <T,>(column: AdminDataTableColumn<T>): string | null => {
  if (column.cardLabel !== undefined) {
    return column.cardLabel;
  }

  return typeof column.header === "string" ? column.header : null;
};

/**
 * Список админки: таблица на десктопе, карточки на мобиле (переключение по CSS,
 * как в каталоге). Липкой шапки нет намеренно: таблица лежит в overflow-x-auto,
 * внутри которого sticky-шапка перестала бы липнуть при прокрутке страницы.
 */
export function AdminDataTable<T>({
  items,
  columns,
  getRowId,
  getRowLabel,
  renderCard,
  selection,
  empty,
  className = ""
}: AdminDataTableProps<T>) {
  if (items.length === 0) {
    return (
      <>
        {empty ?? (
          <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            Пока пусто.
          </p>
        )}
      </>
    );
  }

  const selectableItems = selection
    ? items.filter((item) => (selection.isSelectable ? selection.isSelectable(item) : true))
    : [];
  const selectedIds = new Set(selection?.selectedIds ?? []);
  const selectedOnPage = selectableItems.filter((item) => selectedIds.has(getRowId(item))).length;
  const allSelected = selectableItems.length > 0 && selectedOnPage === selectableItems.length;

  const toggleAll = (checked: boolean) => {
    if (!selection) {
      return;
    }

    const pageIds = selectableItems.map((item) => getRowId(item));
    if (checked) {
      selection.onChange([...new Set([...selection.selectedIds, ...pageIds])]);
      return;
    }

    const pageIdSet = new Set(pageIds);
    selection.onChange(selection.selectedIds.filter((id) => !pageIdSet.has(id)));
  };

  const toggleRow = (id: string, checked: boolean) => {
    if (!selection) {
      return;
    }

    if (checked) {
      selection.onChange([...new Set([...selection.selectedIds, id])]);
      return;
    }

    selection.onChange(selection.selectedIds.filter((value) => value !== id));
  };

  const [titleColumn, ...restColumns] = columns;

  return (
    <div className={className}>
      <div className="hidden overflow-x-auto rounded-lg border border-border bg-card lg:block">
        <Table>
          <TableHeader>
            <TableRow>
              {selection ? (
                <TableHead className="w-10">
                  <Checkbox
                    checked={allSelected}
                    indeterminate={selectedOnPage > 0 && !allSelected}
                    onCheckedChange={toggleAll}
                    disabled={selectableItems.length === 0}
                    aria-label="Выбрать все"
                  />
                </TableHead>
              ) : null}
              {columns.map((column) => (
                <TableHead key={column.key} className={column.headerClassName}>
                  {column.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => {
              const id = getRowId(item);
              const selected = selectedIds.has(id);
              const selectable = selection?.isSelectable ? selection.isSelectable(item) : true;

              return (
                <TableRow key={id} data-state={selected ? "selected" : undefined}>
                  {selection ? (
                    <TableCell className="w-10">
                      <Checkbox
                        checked={selected}
                        disabled={!selectable}
                        onCheckedChange={(checked) => toggleRow(id, checked)}
                        aria-label={getRowLabel ? `Выбрать «${getRowLabel(item)}»` : "Выбрать строку"}
                      />
                    </TableCell>
                  ) : null}
                  {columns.map((column) => (
                    <TableCell key={column.key} className={column.className}>
                      {column.cell(item)}
                    </TableCell>
                  ))}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <div className="grid gap-3 lg:hidden">
        {items.map((item) => {
          const id = getRowId(item);
          const selected = selectedIds.has(id);
          const selectable = selection?.isSelectable ? selection.isSelectable(item) : true;

          return (
            <article
              key={id}
              className={`rounded-2xl border bg-card p-4 shadow-sm ${selected ? "border-primary" : "border-border"}`}
            >
              {renderCard ? (
                <div className="flex items-start gap-3">
                  {selection ? (
                    <Checkbox
                      className="mt-1"
                      checked={selected}
                      disabled={!selectable}
                      onCheckedChange={(checked) => toggleRow(id, checked)}
                      aria-label={getRowLabel ? `Выбрать «${getRowLabel(item)}»` : "Выбрать строку"}
                    />
                  ) : null}
                  <div className="min-w-0 flex-1">{renderCard(item)}</div>
                </div>
              ) : (
                <>
                  <div className="flex items-start gap-3">
                    {selection ? (
                      <Checkbox
                        className="mt-1"
                        checked={selected}
                        disabled={!selectable}
                        onCheckedChange={(checked) => toggleRow(id, checked)}
                        aria-label={getRowLabel ? `Выбрать «${getRowLabel(item)}»` : "Выбрать строку"}
                      />
                    ) : null}
                    {titleColumn ? <div className="min-w-0 flex-1">{titleColumn.cell(item)}</div> : null}
                  </div>

                  {restColumns.some((column) => !column.hideOnCard) ? (
                    <dl className="mt-3 space-y-1.5 text-sm">
                      {restColumns
                        .filter((column) => !column.hideOnCard)
                        .map((column) => {
                          const label = resolveCardLabel(column);
                          return (
                            <div key={column.key} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                              {label ? <dt className="text-xs text-muted-foreground">{label}</dt> : null}
                              <dd className="min-w-0 text-foreground">{column.cell(item)}</dd>
                            </div>
                          );
                        })}
                    </dl>
                  ) : null}
                </>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
