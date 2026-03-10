"use client";
import * as Dialog from "@radix-ui/react-dialog";
import type { ReactNode } from "react";

export const DialogScaffold = ({ trigger, children }: { trigger: ReactNode; children: ReactNode }) => (
  <Dialog.Root>
    <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 bg-black/40" />
      <Dialog.Content className="fixed left-1/2 top-1/2 w-[90vw] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white p-4">
        {children}
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>
);
