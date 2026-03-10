"use client";
import * as Select from "@radix-ui/react-select";
import { ChevronDown } from "lucide-react";

export const SelectScaffold = () => (
  <Select.Root defaultValue="light">
    <Select.Trigger className="flex h-10 w-44 items-center justify-between rounded-md border px-3 text-sm">
      <Select.Value placeholder="Choose style" />
      <ChevronDown className="h-4 w-4" />
    </Select.Trigger>
    <Select.Portal>
      <Select.Content className="rounded-md border bg-white p-1 shadow-lg">
        <Select.Viewport>
          <Select.Item className="cursor-pointer rounded px-2 py-1 text-sm" value="light"><Select.ItemText>Light Ale</Select.ItemText></Select.Item>
          <Select.Item className="cursor-pointer rounded px-2 py-1 text-sm" value="ipa"><Select.ItemText>IPA</Select.ItemText></Select.Item>
        </Select.Viewport>
      </Select.Content>
    </Select.Portal>
  </Select.Root>
);
