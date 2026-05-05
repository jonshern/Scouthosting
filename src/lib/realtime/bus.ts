// In-process pub/sub for channel events. The SSE endpoint
// (/api/v1/channels/:id/stream) registers a subscriber here; routes
// that mutate channel state publish events. Sub-second fan-out for
// v1 single-instance deployments.
//
// Multi-instance deployments need cross-process signaling — the
// obvious upgrade is a Postgres LISTEN/NOTIFY layer that publishes
// here on the receiving side. That's a separate change and doesn't
// affect the public surface of this module.
//
// Event shapes (keep stable — the SSE clients parse these):
//
//   { type: "message",     channelId, message: MessageDto }
//   { type: "suspended",   channelId, reason }
//   { type: "unsuspended", channelId }
//   { type: "archived",    channelId }
//   { type: "heartbeat",   ts }       // SSE keep-alive only

import { EventEmitter } from "node:events";

export type RealtimeEvent =
  | { type: "message"; channelId: string; message: unknown }
  | { type: "suspended"; channelId: string; reason: string | null }
  | { type: "unsuspended"; channelId: string }
  | { type: "archived"; channelId: string }
  | { type: "heartbeat"; ts: number };

const emitter = new EventEmitter();
emitter.setMaxListeners(0);

export function publishMessage(channelId: string, messageDto: unknown): void {
  if (!channelId || !messageDto) return;
  emitter.emit(channelId, { type: "message", channelId, message: messageDto });
}

export function publishSuspended(channelId: string, reason?: string | null): void {
  if (!channelId) return;
  emitter.emit(channelId, { type: "suspended", channelId, reason: reason ?? null });
}

export function publishUnsuspended(channelId: string): void {
  if (!channelId) return;
  emitter.emit(channelId, { type: "unsuspended", channelId });
}

export function publishArchived(channelId: string): void {
  if (!channelId) return;
  emitter.emit(channelId, { type: "archived", channelId });
}

export function subscribe(
  channelId: string,
  handler: (event: RealtimeEvent) => void,
): () => void {
  if (!channelId) throw new Error("subscribe: missing channelId");
  if (typeof handler !== "function") throw new Error("subscribe: handler must be a function");
  emitter.on(channelId, handler);
  return () => emitter.off(channelId, handler);
}

export function subscriberCount(channelId: string): number {
  return emitter.listenerCount(channelId);
}

export function _resetForTests(): void {
  emitter.removeAllListeners();
}
