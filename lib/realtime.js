// In-process pub/sub for channel events. The SSE endpoint
// (/api/v1/channels/:id/stream) registers a subscriber here; routes
// that mutate channel state (POST /messages, suspend/unsuspend, archive)
// publish events. Sub-second fan-out for v1 single-instance deployments.
//
// Multi-instance deployments need cross-process signaling — the obvious
// upgrade is a Postgres LISTEN/NOTIFY layer that publishes here on the
// receiving side. That's a separate change and doesn't affect the
// public surface of this module.
//
// Event shapes (keep stable — the SSE clients parse these):
//
//   { type: "message",       channelId, message: MessageDto }
//   { type: "suspended",     channelId, reason }
//   { type: "unsuspended",   channelId }
//   { type: "archived",      channelId }
//   { type: "heartbeat",     ts }       // SSE keep-alive, not from publish

import { EventEmitter } from "node:events";

const emitter = new EventEmitter();
// Default of 10 listeners per emitter is fine for small channels but a
// busy troop chat can have ~50 concurrent SSE clients on one channel.
emitter.setMaxListeners(0);

/* ------------------------------------------------------------------ */
/* Publish                                                             */
/* ------------------------------------------------------------------ */

export function publishMessage(channelId, messageDto) {
  if (!channelId || !messageDto) return;
  emitter.emit(channelId, { type: "message", channelId, message: messageDto });
}

export function publishSuspended(channelId, reason) {
  if (!channelId) return;
  emitter.emit(channelId, { type: "suspended", channelId, reason: reason || null });
}

export function publishUnsuspended(channelId) {
  if (!channelId) return;
  emitter.emit(channelId, { type: "unsuspended", channelId });
}

export function publishArchived(channelId) {
  if (!channelId) return;
  emitter.emit(channelId, { type: "archived", channelId });
}

/* ------------------------------------------------------------------ */
/* Subscribe                                                           */
/* ------------------------------------------------------------------ */

/**
 * Register a subscriber for one channel. Returns an unsubscribe function.
 * The handler is called on every event for this channel.
 *
 * @param {string} channelId
 * @param {(event: Object) => void} handler
 * @returns {() => void}
 */
export function subscribe(channelId, handler) {
  if (!channelId) throw new Error("subscribe: missing channelId");
  if (typeof handler !== "function") throw new Error("subscribe: handler must be a function");
  emitter.on(channelId, handler);
  return () => emitter.off(channelId, handler);
}

/** How many subscribers are currently attached to this channel. */
export function subscriberCount(channelId) {
  return emitter.listenerCount(channelId);
}

/** Test-only: drop every subscriber. */
export function _resetForTests() {
  emitter.removeAllListeners();
}
