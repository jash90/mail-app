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
export {
  useSync,
  useSyncNextPage,
  isSyncReady,
  createUseSync,
} from './useSyncHooks';
export { useSearchThreads, useSearchContacts } from './useSearchHooks';
export { useLabels } from './useLabelsHook';

export { useContactAutocomplete } from './useContactAutocomplete';

// Screen-level composition hooks
export { useInboxData } from './useInboxData';
export { useThreadSelection } from './useThreadSelection';
export { useThreadDetail } from './useThreadDetail';
