/** Quick filter checkboxes — fast narrowing without typing */
export interface QuickFilters {
  isUnread?: boolean;
  isStarred?: boolean;
  isNewsletter?: boolean;
  isAutoReply?: boolean;
  timeRange?: 'week' | 'month' | 'year' | 'all';
  labelIds?: string[];
}

/** Single search result with scoring */
export interface SearchResult {
  thread: import('./index').EmailThread;
  ftsScore: number;
  aiScore?: number;
  contactImportance?: number;
  finalScore: number;
}
