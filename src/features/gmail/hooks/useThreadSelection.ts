import {
  useTrashThread,
  useArchiveThread,
  useMarkAsRead,
} from './useThreadMutations';
import { analytics } from '@/src/shared/services/analytics';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useState } from 'react';

export function useThreadSelection(accountId: string, selectedLabel: string) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const isSelectionMode = selectedIds.size > 0;
  const [isBatchProcessing, setIsBatchProcessing] = useState(false);

  const trashThreadMutation = useTrashThread(accountId);
  const archiveMutation = useArchiveThread(accountId);
  const markAsReadMutation = useMarkAsRead(accountId);

  // Clear selection when switching labels
  useEffect(() => {
    setSelectedIds(new Set());
  }, [selectedLabel]);

  const toggleSelection = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const handleLongPress = useCallback(
    (id: string) => {
      if (isSelectionMode) {
        toggleSelection(id);
      } else {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        setSelectedIds(new Set([id]));
      }
    },
    [isSelectionMode, toggleSelection],
  );

  const batchDelete = useCallback(async () => {
    if (selectedIds.size === 0) return;
    setIsBatchProcessing(true);
    const ids = Array.from(selectedIds);
    await Promise.allSettled(
      ids.map((id) => {
        analytics.threadTrashed(id);
        return trashThreadMutation.mutateAsync(id);
      }),
    );
    analytics.batchTrashed(ids.length);
    setSelectedIds(new Set());
    setIsBatchProcessing(false);
  }, [selectedIds, trashThreadMutation]);

  const batchArchive = useCallback(async () => {
    if (selectedIds.size === 0) return;
    setIsBatchProcessing(true);
    const ids = Array.from(selectedIds);
    await Promise.allSettled(ids.map((id) => archiveMutation.mutateAsync(id)));
    analytics.batchArchived(ids.length);
    setSelectedIds(new Set());
    setIsBatchProcessing(false);
  }, [selectedIds, archiveMutation]);

  const batchMarkAsRead = useCallback(async () => {
    if (selectedIds.size === 0) return;
    setIsBatchProcessing(true);
    const ids = Array.from(selectedIds);
    await Promise.allSettled(
      ids.map((id) => markAsReadMutation.mutateAsync(id)),
    );
    analytics.batchMarkedAsRead(ids.length);
    setSelectedIds(new Set());
    setIsBatchProcessing(false);
  }, [selectedIds, markAsReadMutation]);

  return {
    selectedIds,
    isSelectionMode,
    toggleSelection,
    clearSelection,
    handleLongPress,
    batchDelete,
    batchArchive,
    batchMarkAsRead,
    isBatchProcessing,
  };
}
