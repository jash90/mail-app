import { threadEvents } from '@/src/shared/services/threadEvents';

describe('threadEvents', () => {
  beforeEach(() => {
    // threadEvents uses module-level Sets — handlers from other tests
    // may leak. We can't reset them but we test the contract.
  });

  describe('onRemoved / emitRemoved', () => {
    it('calls registered handler on emit', () => {
      const handler = jest.fn();
      const unsubscribe = threadEvents.onRemoved(handler);

      threadEvents.emitRemoved('thread-1');
      expect(handler).toHaveBeenCalledWith('thread-1');

      unsubscribe();
    });

    it('stops calling after unsubscribe', () => {
      const handler = jest.fn();
      const unsubscribe = threadEvents.onRemoved(handler);

      unsubscribe();
      threadEvents.emitRemoved('thread-2');
      expect(handler).not.toHaveBeenCalled();
    });

    it('supports multiple handlers', () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();
      const unsub1 = threadEvents.onRemoved(handler1);
      const unsub2 = threadEvents.onRemoved(handler2);

      threadEvents.emitRemoved('thread-3');
      expect(handler1).toHaveBeenCalledWith('thread-3');
      expect(handler2).toHaveBeenCalledWith('thread-3');

      unsub1();
      unsub2();
    });

    it('continues calling remaining handlers after one unsubscribes', () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();
      const unsub1 = threadEvents.onRemoved(handler1);
      const unsub2 = threadEvents.onRemoved(handler2);

      unsub1();
      threadEvents.emitRemoved('thread-4');
      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).toHaveBeenCalledWith('thread-4');

      unsub2();
    });
  });

  describe('onAudioCleanup / emitAudioCleanup', () => {
    it('calls registered handler on emit', () => {
      const handler = jest.fn();
      const unsubscribe = threadEvents.onAudioCleanup(handler);

      threadEvents.emitAudioCleanup('thread-5');
      expect(handler).toHaveBeenCalledWith('thread-5');

      unsubscribe();
    });

    it('stops calling after unsubscribe', () => {
      const handler = jest.fn();
      const unsubscribe = threadEvents.onAudioCleanup(handler);

      unsubscribe();
      threadEvents.emitAudioCleanup('thread-6');
      expect(handler).not.toHaveBeenCalled();
    });
  });
});
