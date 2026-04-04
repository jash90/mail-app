import { getActiveProviderName } from './providers';

let aiActive = false;
let networkActive = 0;

type Waiter = { resolve: () => void; reject: (err: Error) => void };

const aiWaiters: Waiter[] = [];
const networkWaiters: Waiter[] = [];

function drainWaiters(queue: Waiter[]) {
  while (queue.length > 0) {
    queue.shift()!.resolve();
  }
}

function waitInQueue(queue: Waiter[], signal?: AbortSignal): Promise<void> {
  if (!signal) {
    return new Promise<void>((resolve, reject) => {
      queue.push({ resolve, reject });
    });
  }

  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }

    const waiter: Waiter = { resolve, reject };
    queue.push(waiter);

    const onAbort = () => {
      const idx = queue.indexOf(waiter);
      if (idx !== -1) queue.splice(idx, 1);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    signal.addEventListener('abort', onAbort, { once: true });

    // Wrap resolve to clean up listener
    waiter.resolve = () => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    };
  });
}

/**
 * Acquire exclusive AI lock. Waits for active network operations to finish.
 * Returns a release function that MUST be called when done.
 */
export async function acquireAI(signal?: AbortSignal): Promise<() => void> {
  // Wait for network operations to drain
  if (networkActive > 0) {
    await waitInQueue(networkWaiters, signal);
  }

  aiActive = true;

  let released = false;
  return () => {
    if (released) return;
    released = true;
    aiActive = false;
    drainWaiters(aiWaiters);
  };
}

/**
 * Acquire network lock. If local AI is active, waits for it to finish.
 * Returns a release function that MUST be called when done.
 */
export async function acquireNetwork(
  signal?: AbortSignal,
): Promise<() => void> {
  // Only wait if local AI is active
  if (aiActive && getActiveProviderName() === 'local') {
    await waitInQueue(aiWaiters, signal);
  }

  networkActive++;

  let released = false;
  return () => {
    if (released) return;
    released = true;
    networkActive = Math.max(0, networkActive - 1);
    // If no more network ops and AI is waiting, unblock it
    if (networkActive === 0) {
      drainWaiters(networkWaiters);
    }
  };
}

export function isAIActive(): boolean {
  return aiActive;
}
