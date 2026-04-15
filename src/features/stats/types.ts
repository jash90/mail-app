export interface ContactStats {
  email: string;
  name: string | null;
  sentCount: number;
  receivedCount: number;
  totalCount: number;
  lastExchange: string;
  avgResponseTimeMs: number | null;
}

export interface ThreadLengthBucket {
  label: string;
  count: number;
}

export interface EmailStats {
  topSenders: ContactStats[];
  topRecipients: ContactStats[];
  timeDistribution: {
    hourOfDay: number[];
    dayOfWeek: number[];
  };
  threadLengths: {
    buckets: ThreadLengthBucket[];
    average: number;
    median: number;
  };
  totalSent: number;
  totalReceived: number;
  computedAt: string;
  threadCount: number;
  messageCount: number;
  isComplete: boolean;
  failedThreadCount?: number;
  totalListedThreads?: number;
  totalSizeBytes?: number;
  avgMessageSizeBytes?: number;
  newsletterCount?: number;
  autoReplyCount?: number;
}

export interface StatsProgress {
  phase: 'listing' | 'loading' | 'retrying';
  loaded: number;
  total: number;
  failedCount?: number;
  skippedCount?: number;
}

export type { StatMessage } from '@/src/shared/types/stats';
