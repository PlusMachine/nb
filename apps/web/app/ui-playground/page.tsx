"use client";

import { useMemo, useRef, useState } from "react";

import { IngredientPicker } from "@/components/ingredients/ingredient-picker";
import type { IngredientCategory, IngredientSuggestionItem, IngredientType } from "@/features/ingredients/contracts";
import {
  Button,
  Card,
  Dialog,
  DialogCloseButton,
  DialogFooter,
  DialogHeader,
  DropdownMenu,
  Input,
  Popover,
  SelectScaffold,
  Sheet,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Textarea,
  useToast,
  type DropdownMenuItem
} from "@nb/ui";
import { captureTestError } from "../../lib/sentry";
import { trackEvent } from "../../lib/analytics";

const demoItems: IngredientSuggestionItem[] = [
  { id: "1", type: "hop", category: "hop", displayName: "Citra", familyDisplayName: "Citra", subtitle: "13% AA • pellet • 2025", manufacturer: "Yakima Chief", defaultUnit: "g", source: "catalog" },
  { id: "2", type: "hop", category: "hop", displayName: "Mosaic", familyDisplayName: "Mosaic", subtitle: "12% AA • pellet • 2025", manufacturer: "Yakima Chief", defaultUnit: "g", source: "catalog" },
  { id: "3", type: "yeast", category: "yeast", displayName: "SafAle US-05", familyDisplayName: "American Ale", subtitle: "ale yeast • dry • 78% attenuation", manufacturer: "Fermentis", defaultUnit: "pack", source: "catalog" },
  { id: "4", type: "fermentable", category: "fermentable", displayName: "Pilsner Malt", familyDisplayName: "Pilsner Malt", subtitle: "3.5 EBC • 81%", manufacturer: "Weyermann", defaultUnit: "g", source: "catalog" }
];

function DialogBasicDemo() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        Открыть диалог (md)
      </Button>
      <Dialog open={open} onOpenChange={setOpen} title="Пример диалога" description="Базовый Dialog поверх @radix-ui/react-dialog.">
        <div className="p-5 text-sm text-zinc-600">Содержимое диалога. Заголовок выше — реальный aria-заголовок.</div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Отмена</Button>
          <Button onClick={() => setOpen(false)}>Готово</Button>
        </DialogFooter>
      </Dialog>
    </>
  );
}

function DialogGuardDemo() {
  const [open, setOpen] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [blockedAttempts, setBlockedAttempts] = useState(0);

  return (
    <>
      <Button
        variant="outline"
        onClick={() => {
          setDirty(false);
          setBlockedAttempts(0);
          setOpen(true);
        }}
      >
        Открыть диалог с guard
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Редактирование записи"
        hideTitle
        guard={{
          isDirty: () => dirty,
          onGuardedClose: () => setBlockedAttempts((count) => count + 1)
        }}
      >
        <DialogHeader>
          <h2 className="text-base font-semibold text-zinc-900">Редактирование записи</h2>
          <DialogCloseButton />
        </DialogHeader>
        <div className="space-y-3 p-5">
          <label className="flex items-center gap-2 text-sm text-zinc-700">
            <input type="checkbox" checked={dirty} onChange={(event) => setDirty(event.target.checked)} />
            Есть несохранённые изменения (isDirty)
          </label>
          <p className="text-sm text-zinc-500">
            Пока чекбокс включён, Esc / клик по фону / крестик не закроют диалог — вместо этого вызовется onGuardedClose.
            Заблокировано попыток закрытия: {blockedAttempts}
          </p>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              setDirty(false);
              setOpen(false);
            }}
          >
            Сбросить изменения и закрыть
          </Button>
          <Button onClick={() => setOpen(false)}>Закрыть (сработает guard, если isDirty)</Button>
        </DialogFooter>
      </Dialog>
    </>
  );
}

function DialogSheetSizeDemo() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        Открыть диалог (size=&quot;sheet&quot;)
      </Button>
      <Dialog open={open} onOpenChange={setOpen} title="Диалог-«лист»" hideTitle size="sheet">
        <DialogHeader>
          <h2 className="text-base font-semibold text-zinc-900">Диалог-«лист»</h2>
          <DialogCloseButton />
        </DialogHeader>
        <div className="p-5 text-sm text-zinc-600">
          size=&quot;sheet&quot; — на мобиле прижат к низу, на sm+ центрируется и занимает больше ширины, чем md/lg.
        </div>
        <DialogFooter>
          <Button onClick={() => setOpen(false)}>Закрыть</Button>
        </DialogFooter>
      </Dialog>
    </>
  );
}

function SheetDemo() {
  const [bottomOpen, setBottomOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(false);
  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" onClick={() => setBottomOpen(true)}>
        Открыть Sheet (bottom)
      </Button>
      <Sheet open={bottomOpen} onOpenChange={setBottomOpen} title="Фильтры" side="bottom">
        <p className="text-sm text-zinc-600">side=&quot;bottom&quot; — всегда bottom-sheet, независимо от ширины экрана.</p>
      </Sheet>

      <Button variant="outline" onClick={() => setRightOpen(true)}>
        Открыть Sheet (right)
      </Button>
      <Sheet open={rightOpen} onOpenChange={setRightOpen} title="Детали" side="right">
        <p className="text-sm text-zinc-600">
          side=&quot;right&quot; — на sm+ боковая панель во всю высоту справа, на мобиле — bottom-sheet.
        </p>
      </Sheet>
    </div>
  );
}

function PopoverDemo() {
  return (
    <Popover
      align="start"
      trigger={({ open }) => <Button variant="outline">{open ? "Popover открыт" : "Открыть popover"}</Button>}
    >
      {({ close }) => (
        <div className="space-y-2">
          <p className="text-sm text-zinc-700">Контент в портале — не обрезается overflow-hidden родителя.</p>
          <Button size="sm" onClick={close}>
            Закрыть
          </Button>
        </div>
      )}
    </Popover>
  );
}

function DropdownMenuDemo() {
  const items: DropdownMenuItem[] = [
    { key: "edit", label: "Редактировать", onSelect: () => trackEvent("ui_playground_dropdown_select", { item: "edit" }) },
    { key: "duplicate", label: "Дублировать", onSelect: () => trackEvent("ui_playground_dropdown_select", { item: "duplicate" }) },
    { key: "disabled", label: "Недоступно", disabled: true, onSelect: () => {} },
    { key: "delete", label: "Удалить", tone: "danger", onSelect: () => trackEvent("ui_playground_dropdown_select", { item: "delete" }) }
  ];
  return <DropdownMenu trigger={<Button variant="outline">Меню действий</Button>} items={items} aria-label="Действия" />;
}

function ToastDemo() {
  const { show } = useToast();
  const pendingRef = useRef<{ dismiss: () => void } | null>(null);

  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" onClick={() => show({ title: "Сохранено", tone: "success" })}>
        Обычный тост
      </Button>
      <Button
        variant="outline"
        onClick={() =>
          show({
            title: "Ингредиент удалён",
            description: "Действие можно отменить.",
            tone: "danger",
            action: { label: "Отменить", onClick: () => trackEvent("ui_playground_toast_undo", {}) }
          })
        }
      >
        Тост с action
      </Button>
      <Button
        variant="outline"
        onClick={() => {
          pendingRef.current?.dismiss();
          pendingRef.current = show({
            title: "Загрузка отчёта…",
            description: "durationMs=Infinity — не закроется сам, только по кнопке ниже.",
            durationMs: Infinity
          });
        }}
      >
        Тост без автозакрытия
      </Button>
      <Button
        variant="ghost"
        onClick={() => {
          pendingRef.current?.dismiss();
          pendingRef.current = null;
        }}
      >
        Закрыть его вручную (dismiss handle)
      </Button>
    </div>
  );
}

export default function UiPlaygroundPage() {
  const [selected, setSelected] = useState<IngredientSuggestionItem | null>(null);
  const [pickerType, setPickerType] = useState<IngredientType | undefined>(undefined);
  const [pickerCategory, setPickerCategory] = useState<IngredientCategory | undefined>(undefined);

  const mockSearch = useMemo(() => {
    return async ({
      q,
      type,
      category,
      limit
    }: {
      q: string;
      type?: IngredientType;
      category?: IngredientCategory;
      limit: number;
      signal: AbortSignal;
    }) => {
      const query = q.trim().toLowerCase();
      const filtered = demoItems
        .filter((item) => (type ? item.type === type : true))
        .filter((item) => (category ? item.category === category : true))
        .filter((item) => item.displayName.toLowerCase().includes(query) || item.subtitle?.toLowerCase().includes(query))
        .slice(0, limit);
      return filtered;
    };
  }, []);

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-4 p-6">
      <h1 className="text-2xl font-semibold">UI Foundation Playground</h1>
      <Card className="space-y-3">
        <h2 className="text-lg font-semibold">IngredientPicker demo (QA tool)</h2>
        <p className="text-sm text-zinc-600">Use this internal playground to verify search-as-you-type, keyboard navigation, type filtering and selection callback.</p>
        <label className="text-sm">
          Type filter
          <select className="mt-1 w-full rounded border p-2" value={pickerType ?? "all"} onChange={(event) => setPickerType(event.target.value === "all" ? undefined : event.target.value as IngredientType)}>
            <option value="all">all</option>
            <option value="fermentable">fermentable</option>
            <option value="hop">hop</option>
            <option value="yeast">yeast</option>
            <option value="sugar">sugar</option>
            <option value="adjunct">adjunct</option>
            <option value="fining">fining</option>
            <option value="misc">misc</option>
          </select>
        </label>
        <label className="text-sm">
          Category filter
          <select className="mt-1 w-full rounded border p-2" value={pickerCategory ?? "all"} onChange={(event) => setPickerCategory(event.target.value === "all" ? undefined : event.target.value as IngredientCategory)}>
            <option value="all">all</option>
            <option value="fermentable">fermentable</option>
            <option value="hop">hop</option>
            <option value="yeast">yeast</option>
            <option value="water_prep">water_prep</option>
            <option value="misc">misc</option>
          </select>
        </label>
        <IngredientPicker
          type={pickerType}
          category={pickerCategory}
          searchIngredients={mockSearch}
          onSelect={(item) => setSelected(item)}
          emptyCta={<p className="text-xs text-zinc-500">Не нашли? Предложить / создать свой ингредиент</p>}
        />
        <div className="rounded bg-zinc-50 p-2 text-sm">
          Selection callback: {selected ? `${selected.displayName} (${selected.type})` : "nothing selected"}
        </div>
      </Card>
      <Card className="space-y-3">
        <div className="flex gap-2">
          <Button onClick={() => trackEvent("foundation_test_event", { source: "ui_playground" })}>Send PostHog event</Button>
          <Button variant="outline" onClick={() => captureTestError()}>Trigger Sentry error</Button>
        </div>
        <Input placeholder="Ingredient name" />
        <Textarea placeholder="Notes" />
        <SelectScaffold />
      </Card>
      <Card className="space-y-3">
        <h2 className="text-lg font-semibold">Dialog</h2>
        <div className="flex flex-wrap gap-2">
          <DialogBasicDemo />
          <DialogGuardDemo />
          <DialogSheetSizeDemo />
        </div>
      </Card>
      <Card className="space-y-3">
        <h2 className="text-lg font-semibold">Sheet</h2>
        <SheetDemo />
      </Card>
      <Card className="space-y-3">
        <h2 className="text-lg font-semibold">Popover</h2>
        <PopoverDemo />
      </Card>
      <Card className="space-y-3">
        <h2 className="text-lg font-semibold">DropdownMenu</h2>
        <DropdownMenuDemo />
      </Card>
      <Card className="space-y-3">
        <h2 className="text-lg font-semibold">Toast</h2>
        <ToastDemo />
      </Card>
      <Card>
        <Table>
          <THead><TR><TH>Module</TH><TH>Status</TH></TR></THead>
          <TBody><TR><TD>UI</TD><TD>Ready</TD></TR><TR><TD>DB</TD><TD>Ready</TD></TR></TBody>
        </Table>
      </Card>
    </main>
  );
}
