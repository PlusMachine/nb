"use client";

import { Button, Card, DialogScaffold, Input, SelectScaffold, Table, TBody, TD, TH, THead, TR, Textarea, ToastScaffold } from "@nb/ui";
import { captureTestError } from "../../lib/sentry";
import { trackEvent } from "../../lib/analytics";

export default function UiPlaygroundPage() {
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-4 p-6">
      <h1 className="text-2xl font-semibold">UI Foundation Playground</h1>
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
