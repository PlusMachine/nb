"use client";
import * as Toast from "@radix-ui/react-toast";
import { useState } from "react";
import { Button } from "./button";

export const ToastScaffold = () => {
  const [open, setOpen] = useState(false);
  return (
    <Toast.Provider swipeDirection="right">
      <Button variant="outline" onClick={() => setOpen(true)}>Show toast</Button>
      <Toast.Root open={open} onOpenChange={setOpen} className="rounded-md border bg-white p-3 shadow-lg">
        <Toast.Title className="font-medium">Foundation ready</Toast.Title>
        <Toast.Description className="text-sm text-zinc-500">UI primitives are connected.</Toast.Description>
      </Toast.Root>
      <Toast.Viewport className="fixed bottom-2 right-2" />
    </Toast.Provider>
  );
};
