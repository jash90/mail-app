type Handler = (threadId: string) => void;

const listeners = new Set<Handler>();

export const threadEvents = {
  onRemoved(handler: Handler) {
    listeners.add(handler);
    return () => {
      listeners.delete(handler);
    };
  },
  emitRemoved(threadId: string) {
    listeners.forEach((fn) => fn(threadId));
  },
};
