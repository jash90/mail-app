/**
 * Centralized typed error classes for the mail app.
 * Each domain has its own error class with structured metadata.
 */

export type ErrorSeverity = 'warning' | 'error' | 'fatal';

interface ErrorMeta {
  severity: ErrorSeverity;
  retryable: boolean;
  [key: string]: unknown;
}

abstract class AppError extends Error {
  abstract readonly domain: string;
  readonly meta: ErrorMeta;

  constructor(message: string, meta: ErrorMeta, cause?: unknown) {
    super(message, { cause });
    this.name = this.constructor.name;
    this.meta = meta;
  }

  /** Whether the operation that caused this error can be retried. */
  get retryable(): boolean {
    return this.meta.retryable;
  }
}

// ── Auth ──────────────────────────────────────────────────────────────

export type AuthErrorCode =
  | 'TOKEN_EXPIRED'
  | 'REFRESH_FAILED'
  | 'SILENT_SIGNIN_FAILED'
  | 'NOT_AUTHENTICATED'
  | 'SIGNOUT_FAILED';

export class AuthError extends AppError {
  readonly domain = 'auth' as const;
  readonly code: AuthErrorCode;

  constructor(code: AuthErrorCode, message: string, cause?: unknown) {
    const retryable = code === 'REFRESH_FAILED' || code === 'TOKEN_EXPIRED';
    super(message, { severity: 'error', retryable }, cause);
    this.code = code;
  }
}

// ── Sync ──────────────────────────────────────────────────────────────

export type SyncErrorCode =
  | 'HISTORY_TOO_OLD'
  | 'NETWORK_ERROR'
  | 'RATE_LIMITED'
  | 'API_ERROR'
  | 'DB_WRITE_FAILED'
  | 'PAGINATION_FAILED';

export class SyncError extends AppError {
  readonly domain = 'sync' as const;
  readonly code: SyncErrorCode;

  constructor(code: SyncErrorCode, message: string, cause?: unknown) {
    const retryable = [
      'NETWORK_ERROR',
      'RATE_LIMITED',
      'PAGINATION_FAILED',
    ].includes(code);
    const severity: ErrorSeverity =
      code === 'DB_WRITE_FAILED' ? 'fatal' : 'error';
    super(message, { severity, retryable }, cause);
    this.code = code;
  }
}

// ── AI Provider ───────────────────────────────────────────────────────

export type AIProviderErrorCode =
  | 'API_KEY_MISSING'
  | 'API_ERROR'
  | 'TIMEOUT'
  | 'MODEL_NOT_FOUND'
  | 'MODEL_LOAD_FAILED'
  | 'EMPTY_RESPONSE'
  | 'ABORTED';

export class AIProviderError extends AppError {
  readonly domain = 'ai' as const;
  readonly code: AIProviderErrorCode;

  constructor(code: AIProviderErrorCode, message: string, cause?: unknown) {
    const retryable = ['API_ERROR', 'TIMEOUT'].includes(code);
    const severity: ErrorSeverity = code === 'ABORTED' ? 'warning' : 'error';
    super(message, { severity, retryable }, cause);
    this.code = code;
  }
}

// ── TTS ───────────────────────────────────────────────────────────────

export type TTSErrorCode =
  | 'MODEL_NOT_DOWNLOADED'
  | 'MODEL_LOAD_FAILED'
  | 'SYNTHESIS_FAILED'
  | 'PLAYBACK_FAILED'
  | 'UNSUPPORTED_LANGUAGE';

export class TTSError extends AppError {
  readonly domain = 'tts' as const;
  readonly code: TTSErrorCode;

  constructor(code: TTSErrorCode, message: string, cause?: unknown) {
    const retryable = code === 'SYNTHESIS_FAILED' || code === 'PLAYBACK_FAILED';
    super(message, { severity: 'error', retryable }, cause);
    this.code = code;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────

/** Type guard: is this one of our domain errors? */
export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

/** Extract a user-friendly message from any error. */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'An unknown error occurred';
}
