"use client";

import { useMemo, useState } from "react";

import { IngredientPicker } from "@/components/ingredients/ingredient-picker";
import type { IngredientCategory, IngredientSuggestionItem, IngredientType } from "@/features/ingredients/contracts";
import { Button, Card, DialogScaffold, Input, SelectScaffold, Table, TBody, TD, TH, THead, TR, Textarea, ToastScaffold } from "@nb/ui";
import { captureTestError } from "../../lib/sentry";
import { trackEvent } from "../../lib/analytics";

const demoItems: IngredientSuggestionItem[] = [
  { id: "1", type: "hop", category: "hop", displayName: "Citra", familyDisplayName: "Citra", subtitle: "13% AA • pellet • 2025", manufacturer: "Yakima Chief", defaultUnit: "g", source: "catalog" },
  { id: "2", type: "hop", category: "hop", displayName: "Mosaic", familyDisplayName: "Mosaic", subtitle: "12% AA • pellet • 2025", manufacturer: "Yakima Chief", defaultUnit: "g", source: "catalog" },
  { id: "3", type: "yeast", category: "yeast", displayName: "SafAle US-05", familyDisplayName: "American Ale", subtitle: "ale yeast • dry • 78% attenuation", manufacturer: "Fermentis", defaultUnit: "pack", source: "catalog" },
  { id: "4", type: "fermentable", category: "fermentable", displayName: "Pilsner Malt", familyDisplayName: "Pilsner Malt", subtitle: "3.5 EBC • 81%", manufacturer: "Weyermann", defaultUnit: "g", source: "catalog" }
];

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
          <ToastScaffold />
        </div>
        <Input placeholder="Ingredient name" />
        <Textarea placeholder="Notes" />
        <SelectScaffold />
      </Card>
      <Card>
        <DialogScaffold trigger={<Button variant="ghost">Open dialog scaffold</Button>}>
          <p className="text-sm">Dialog/Drawer foundation is connected.</p>
        </DialogScaffold>
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
