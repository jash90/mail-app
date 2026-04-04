import { posthog } from './posthog';

export const analytics = {
  // Auth events
  login(userId: string, email: string) {
    posthog.identify(userId, { email });
    posthog.capture('user_logged_in');
  },

  logout() {
    posthog.capture('user_logged_out');
    posthog.reset();
  },

  // Email events
  threadOpened(threadId: string) {
    posthog.capture('thread_opened', { thread_id: threadId });
  },

  threadTrashed(threadId: string) {
    posthog.capture('thread_trashed', { thread_id: threadId });
  },

  emailComposed() {
    posthog.capture('email_compose_started');
  },

  emailSent() {
    posthog.capture('email_sent');
  },

  replySent(threadId: string) {
    posthog.capture('reply_sent', { thread_id: threadId });
  },

  // AI events
  aiReplyGenerated(threadId: string) {
    posthog.capture('ai_reply_generated', { thread_id: threadId });
  },

  aiEmailGenerated() {
    posthog.capture('ai_email_generated');
  },

  summaryRequested(threadCount: number) {
    posthog.capture('summary_requested', { thread_count: threadCount });
  },

  // Batch actions
  batchTrashed(count: number) {
    posthog.capture('batch_threads_trashed', { count });
  },

  batchArchived(count: number) {
    posthog.capture('batch_threads_archived', { count });
  },

  batchMarkedAsRead(count: number) {
    posthog.capture('batch_threads_marked_as_read', { count });
  },

  // Sync events
  inboxRefreshed() {
    posthog.capture('inbox_refreshed');
  },

  // Navigation
  screenViewed(screenName: string) {
    posthog.screen(screenName);
  },
} as const;
