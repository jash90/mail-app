import {
  acquireAI,
  acquireNetwork,
  registerLocalAICheck,
  isAIActive,
} from '@/src/shared/services/resourceLock';

// Unmock resourceLock — we need the real implementation for these tests.
// The global mock in setup.ts covers other test files.
jest.unmock('@/src/shared/services/resourceLock');

// Re-import after unmock to get the real module
jest.resetModules();

const {
  acquireAI: realAcquireAI,
  acquireNetwork: realAcquireNetwork,
  registerLocalAICheck: realRegisterLocalAICheck,
  isAIActive: realIsAIActive,
} = jest.requireActual('@/src/shared/services/resourceLock');

describe('resourceLock', () => {
  beforeEach(() => {
    realRegisterLocalAICheck(() => false);
  });

  describe('acquireAI', () => {
    it('acquires and releases AI lock', async () => {
      const release = await realAcquireAI();
      expect(realIsAIActive()).toBe(true);
      release();
      expect(realIsAIActive()).toBe(false);
    });

    it('does not affect AI state after double release', async () => {
      const release = await realAcquireAI();
      release();
      release(); // second call should be no-op
      expect(realIsAIActive()).toBe(false);
    });

    it('waits for network operations to finish before acquiring', async () => {
      const releaseNetwork = await realAcquireNetwork();

      // acquireAI should wait until network is released
      const aiPromise = realAcquireAI();
      // AI should not be active yet
      expect(realIsAIActive()).toBe(false);

      // Release network — now AI can proceed
      releaseNetwork();
      const releaseAI = await aiPromise;
      expect(realIsAIActive()).toBe(true);
      releaseAI();
    });

    it('respects abort signal', async () => {
      const releaseNetwork = await realAcquireNetwork();
      const controller = new AbortController();
      controller.abort();

      await expect(realAcquireAI(controller.signal)).rejects.toThrow('Aborted');
      releaseNetwork();
    });
  });

  describe('acquireNetwork', () => {
    it('acquires and releases network lock', async () => {
      const release = await realAcquireNetwork();
      release();
      // No error means success
    });

    it('allows concurrent network operations', async () => {
      const release1 = await realAcquireNetwork();
      const release2 = await realAcquireNetwork();
      // Both acquired without waiting
      release1();
      release2();
    });

    it('double release is safe', async () => {
      const release = await realAcquireNetwork();
      release();
      release(); // should not throw or go negative
    });
  });

  describe('local AI coordination', () => {
    it('network waits when local AI is active', async () => {
      realRegisterLocalAICheck(() => true);

      const releaseAI = await realAcquireAI();
      expect(realIsAIActive()).toBe(true);

      // acquireNetwork should wait for AI to finish
      const networkPromise = realAcquireNetwork();

      // Release AI — network can now proceed
      releaseAI();
      const releaseNetwork = await networkPromise;
      releaseNetwork();
    });

    it('network does not wait when AI is cloud', async () => {
      realRegisterLocalAICheck(() => false);

      const releaseAI = await realAcquireAI();
      // Even though AI is "active", it's cloud — network doesn't wait
      const releaseNetwork = await realAcquireNetwork();
      releaseNetwork();
      releaseAI();
    });
  });

  describe('registerLocalAICheck', () => {
    it('uses registered callback to determine local AI status', async () => {
      const mockCheck = jest.fn(() => true);
      realRegisterLocalAICheck(mockCheck);

      const releaseAI = await realAcquireAI();
      // Trigger network acquisition which checks local AI
      const networkPromise = realAcquireNetwork();

      expect(mockCheck).toHaveBeenCalled();
      releaseAI();
      const releaseNetwork = await networkPromise;
      releaseNetwork();
    });
  });
});
