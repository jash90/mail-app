type ThreadHandler = (threadId: string) => void;

interface EventMap {
  removed: ThreadHandler;
  audioCleanup: ThreadHandler;
}

type EventName = keyof EventMap;

const listeners = new Map<EventName, Set<ThreadHandler>>();

function getListenerSet<E extends EventName>(event: E): Set<EventMap[E]> {
  if (!listeners.has(event)) {
    listeners.set(event, new Set());
  }
  return listeners.get(event)! as Set<EventMap[E]>;
}

/**
 * Typed event bus for thread-related cross-feature communication.
 * Replaces untyped Set-based listeners with a unified, typed interface.
 */
export const threadEvents = {
  /** Register a handler for a thread event. Returns an unsubscribe function. */
  on<E extends EventName>(event: E, handler: EventMap[E]): () => void {
    getListenerSet(event).add(handler);
    return () => {
      getListenerSet(event).delete(handler);
    };
  },

  /** Emit a thread event to all registered handlers. */
  emit<E extends EventName>(event: E, threadId: string): void {
    getListenerSet(event).forEach((fn) => fn(threadId));
  },

  // ── Convenience aliases matching previous API ──────────────────

  onRemoved(handler: ThreadHandler) {
    return this.on('removed', handler);
  },
  emitRemoved(threadId: string) {
    this.emit('removed', threadId);
  },

  onAudioCleanup(handler: ThreadHandler) {
    return this.on('audioCleanup', handler);
  },
  emitAudioCleanup(threadId: string) {
    this.emit('audioCleanup', threadId);
  },
};
