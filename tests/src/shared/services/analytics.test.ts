// Mock posthog at the module level — must be before analytics import
jest.mock('@/src/shared/services/posthog', () => ({
  posthog: {
    identify: jest.fn(),
    capture: jest.fn(),
    reset: jest.fn(),
    screen: jest.fn(),
  },
}));

import { analytics } from '@/src/shared/services/analytics';
import { posthog } from '@/src/shared/services/posthog';

const mockIdentify = posthog!.identify as jest.Mock;
const mockCapture = posthog!.capture as jest.Mock;
const mockReset = posthog!.reset as jest.Mock;
const mockScreen = posthog!.screen as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('analytics', () => {
  describe('login', () => {
    it('identifies user and captures event', () => {
      analytics.login('user-1', 'test@example.com');
      expect(mockIdentify).toHaveBeenCalledWith('user-1', {
        email: 'test@example.com',
      });
      expect(mockCapture).toHaveBeenCalledWith('user_logged_in');
    });
  });

  describe('logout', () => {
    it('captures event and resets posthog', () => {
      analytics.logout();
      expect(mockCapture).toHaveBeenCalledWith('user_logged_out');
      expect(mockReset).toHaveBeenCalled();
    });
  });

  describe('email events', () => {
    it('threadOpened', () => {
      analytics.threadOpened('thread-123');
      expect(mockCapture).toHaveBeenCalledWith('thread_opened', {
        thread_id: 'thread-123',
      });
    });

    it('threadTrashed', () => {
      analytics.threadTrashed('thread-456');
      expect(mockCapture).toHaveBeenCalledWith('thread_trashed', {
        thread_id: 'thread-456',
      });
    });

    it('emailComposed', () => {
      analytics.emailComposed();
      expect(mockCapture).toHaveBeenCalledWith('email_compose_started');
    });

    it('emailSent', () => {
      analytics.emailSent();
      expect(mockCapture).toHaveBeenCalledWith('email_sent');
    });

    it('replySent', () => {
      analytics.replySent('thread-789');
      expect(mockCapture).toHaveBeenCalledWith('reply_sent', {
        thread_id: 'thread-789',
      });
    });
  });

  describe('AI events', () => {
    it('aiReplyGenerated', () => {
      analytics.aiReplyGenerated('thread-1');
      expect(mockCapture).toHaveBeenCalledWith('ai_reply_generated', {
        thread_id: 'thread-1',
      });
    });

    it('aiEmailGenerated', () => {
      analytics.aiEmailGenerated();
      expect(mockCapture).toHaveBeenCalledWith('ai_email_generated');
    });

    it('summaryRequested', () => {
      analytics.summaryRequested(5);
      expect(mockCapture).toHaveBeenCalledWith('summary_requested', {
        thread_count: 5,
      });
    });
  });

  describe('batch actions', () => {
    it('batchTrashed', () => {
      analytics.batchTrashed(10);
      expect(mockCapture).toHaveBeenCalledWith('batch_threads_trashed', {
        count: 10,
      });
    });

    it('batchArchived', () => {
      analytics.batchArchived(3);
      expect(mockCapture).toHaveBeenCalledWith('batch_threads_archived', {
        count: 3,
      });
    });

    it('batchMarkedAsRead', () => {
      analytics.batchMarkedAsRead(7);
      expect(mockCapture).toHaveBeenCalledWith('batch_threads_marked_as_read', {
        count: 7,
      });
    });
  });

  describe('sync and navigation', () => {
    it('inboxRefreshed', () => {
      analytics.inboxRefreshed();
      expect(mockCapture).toHaveBeenCalledWith('inbox_refreshed');
    });

    it('screenViewed', () => {
      analytics.screenViewed('InboxScreen');
      expect(mockScreen).toHaveBeenCalledWith('InboxScreen');
    });
  });
});
