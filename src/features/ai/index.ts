// AI feature public API
export {
  getProvider,
  getActiveProviderName,
  releaseLocalProvider,
} from './providers';
export {
  getSummaryCache,
  getSummaryCacheBatch,
  summarizeEmail,
  prefetchSummaries,
  generateEmail,
  generateReply,
} from './services/api';
export { LocalModelManager } from './components/LocalModelManager';
export { TOKEN_TRACKING_ENABLED } from './services/tokenTracker';

// Hooks
export {
  useAICompose,
  useSummaryPipeline,
  useAITokenStats,
} from './hooks/index';
export type {
  SummaryItem,
  PipelinePhase,
  SummaryPipelineDeps,
} from './hooks/index';
export type { AITokenStats } from './hooks/index';
