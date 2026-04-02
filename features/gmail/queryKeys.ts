export const gmailKeys = {
  all: ['gmail'] as const,
  threads: (accountId: string, labelIds?: string[], sortMode?: string) =>
    [
      ...gmailKeys.all,
      'threads',
      accountId,
      ...(labelIds ?? []),
      ...(sortMode ? [sortMode] : []),
    ] as const,
  thread: (accountId: string, threadId: string) =>
    [...gmailKeys.all, 'thread', accountId, threadId] as const,
  messages: (accountId: string, threadId: string) =>
    [...gmailKeys.all, 'messages', accountId, threadId] as const,
  labels: (accountId: string) =>
    [...gmailKeys.all, 'labels', accountId] as const,
  contacts: (query: string) => [...gmailKeys.all, 'contacts', query] as const,
  stats: (accountId: string) => [...gmailKeys.all, 'stats', accountId] as const,
  search: (
    accountId: string,
    query: string,
    filters: Record<string, unknown>,
  ) =>
    [
      ...gmailKeys.all,
      'search',
      accountId,
      query,
      JSON.stringify(filters),
    ] as const,
};
