export interface TTSTrack {
  threadId: string;
  senderName: string;
  summarySnippet: string;
  fullSummary: string;
  lang: string;
}

export interface TTSQueueState {
  tracks: TTSTrack[];
  currentIndex: number;
  isPlaying: boolean;
  isLoading: boolean;
  error: string | null;
  pendingCount: number;
  summarizing: boolean;
}
