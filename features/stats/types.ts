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
}

export interface StatsProgress {
  phase: 'listing' | 'loading' | 'retrying';
  loaded: number;
  total: number;
  failedCount?: number;
  skippedCount?: number;
}

/** Lightweight message representation for stats computation — avoids full EmailMessage overhead */
export interface StatMessage {
  id: string; // Gmail message ID
  from: string;
  to: string[];
  cc: string[];
  bcc: string[];
  date: number; // timestamp ms
}
