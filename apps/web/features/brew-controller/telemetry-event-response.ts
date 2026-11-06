import { subscribeDeviceTelemetry, type TelemetryFrame } from "./device-telemetry-cache";

const encodeFrame = (frame: TelemetryFrame) => {
  if (frame.type === "telemetry") return `data: ${JSON.stringify(frame.data)}\n\n`;
  const data = frame.type === "error" ? { error: frame.error } : {};
  return `event: ${frame.type}\ndata: ${JSON.stringify(data)}\n\n`;
};

export function telemetryEventResponse(
  signal: AbortSignal,
  device: Parameters<typeof subscribeDeviceTelemetry>[0]
): Response {
  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | undefined;
  let onAbort: () => void;
  let closed = false;
  const dispose = () => {
    if (closed) return;
    closed = true;
    signal.removeEventListener("abort", onAbort);
    unsubscribe?.();
  };

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      onAbort = () => {
        dispose();
        controller.close();
      };
      if (signal.aborted) {
        onAbort();
        return;
      }
      signal.addEventListener("abort", onAbort, { once: true });
      unsubscribe = subscribeDeviceTelemetry(device, frame => {
        // An SSE reader that falls behind can resume with the next live frame.
        if (!closed && (controller.desiredSize ?? 0) > 0) {
          controller.enqueue(encoder.encode(encodeFrame(frame)));
        }
      });
      if (closed) unsubscribe();
    },
    cancel: dispose
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "private, no-store, no-transform",
      "X-Accel-Buffering": "no"
    }
  });
}
