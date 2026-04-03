// --- Core React Query hooks ---
export { useThreads, useThread, useThreadMessages } from './useThreadQueries';
export {
  useMarkAsRead,
  useMarkAsUnread,
  useToggleStar,
  useArchiveThread,
  useTrashThread,
  useDeleteThread,
} from './useThreadMutations';
export { useSendEmail, useSendReply } from './useSendHooks';
export { useSync, useSyncNextPage, isSyncReady } from './useSyncHooks';
export {
  useContactImportance,
  useSearchThreads,
  useSearchContacts,
} from './useSearchHooks';
export { useLabels } from './useLabelsHook';

// --- Screen-level hooks ---
export { useInboxScreen } from './useInboxScreen';
export { useThreadScreen } from './useThreadScreen';
export { useContactAutocomplete } from './useContactAutocomplete';
