import { expect, it } from "vitest";
import { readLimitedText } from "@/lib/read-limited-text";

function chunkedRequest(chunks: Uint8Array[], onPull: () => void, onCancel?: () => void) {
  const queue = [...chunks];
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      onPull();
      const chunk = queue.shift();
      if (chunk) controller.enqueue(chunk);
      else controller.close();
    },
    cancel: onCancel
  }, { highWaterMark: 0 });
  return new Request("http://localhost/api/ingest/token", { method: "POST", body, duplex: "half" } as RequestInit);
}

it("stops consuming a chunked body at the first chunk above the byte limit", async () => {
  let reads = 0;
  let canceled = false;
  const request = chunkedRequest(
    [new Uint8Array(3000), new Uint8Array(1500), new Uint8Array(1000)],
    () => { reads += 1; },
    () => { canceled = true; }
  );

  expect(await readLimitedText(request, 4096)).toBeNull();
  expect(reads).toBe(2);
  expect(canceled).toBe(true);
});

it("decodes a UTF-8 character split across chunks at the exact byte limit", async () => {
  const bytes = new TextEncoder().encode("Пиво");
  const request = chunkedRequest([bytes.slice(0, 1), bytes.slice(1)], () => {});
  expect(await readLimitedText(request, bytes.length)).toBe("Пиво");
});
