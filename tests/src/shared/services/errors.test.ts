import {
  AuthError,
  SyncError,
  AIProviderError,
  TTSError,
  isAppError,
  getErrorMessage,
} from '@/src/shared/services/errors';

describe('AuthError', () => {
  it('creates error with correct properties', () => {
    const err = new AuthError('TOKEN_EXPIRED', 'Token has expired');
    expect(err.name).toBe('AuthError');
    expect(err.domain).toBe('auth');
    expect(err.code).toBe('TOKEN_EXPIRED');
    expect(err.message).toBe('Token has expired');
    expect(err.retryable).toBe(true);
  });

  it('marks REFRESH_FAILED as retryable', () => {
    const err = new AuthError('REFRESH_FAILED', 'Refresh failed');
    expect(err.retryable).toBe(true);
  });

  it('marks NOT_AUTHENTICATED as non-retryable', () => {
    const err = new AuthError('NOT_AUTHENTICATED', 'Not authenticated');
    expect(err.retryable).toBe(false);
  });

  it('preserves cause', () => {
    const cause = new Error('original');
    const err = new AuthError('TOKEN_EXPIRED', 'Wrapper', cause);
    expect(err.cause).toBe(cause);
  });
});

describe('SyncError', () => {
  it('marks NETWORK_ERROR as retryable', () => {
    const err = new SyncError('NETWORK_ERROR', 'No internet');
    expect(err.retryable).toBe(true);
    expect(err.domain).toBe('sync');
  });

  it('marks RATE_LIMITED as retryable', () => {
    const err = new SyncError('RATE_LIMITED', 'Too many requests');
    expect(err.retryable).toBe(true);
  });

  it('marks DB_WRITE_FAILED as fatal severity', () => {
    const err = new SyncError('DB_WRITE_FAILED', 'Write failed');
    expect(err.meta.severity).toBe('fatal');
    expect(err.retryable).toBe(false);
  });

  it('marks HISTORY_TOO_OLD as non-retryable', () => {
    const err = new SyncError('HISTORY_TOO_OLD', 'History expired');
    expect(err.retryable).toBe(false);
  });
});

describe('AIProviderError', () => {
  it('marks API_ERROR as retryable', () => {
    const err = new AIProviderError('API_ERROR', 'Server error');
    expect(err.retryable).toBe(true);
    expect(err.domain).toBe('ai');
  });

  it('marks TIMEOUT as retryable', () => {
    const err = new AIProviderError('TIMEOUT', 'Request timed out');
    expect(err.retryable).toBe(true);
  });

  it('marks ABORTED as warning severity', () => {
    const err = new AIProviderError('ABORTED', 'User cancelled');
    expect(err.meta.severity).toBe('warning');
    expect(err.retryable).toBe(false);
  });

  it('marks MODEL_NOT_FOUND as non-retryable', () => {
    const err = new AIProviderError('MODEL_NOT_FOUND', 'No model');
    expect(err.retryable).toBe(false);
  });
});

describe('TTSError', () => {
  it('marks SYNTHESIS_FAILED as retryable', () => {
    const err = new TTSError('SYNTHESIS_FAILED', 'TTS failed');
    expect(err.retryable).toBe(true);
    expect(err.domain).toBe('tts');
  });

  it('marks MODEL_NOT_DOWNLOADED as non-retryable', () => {
    const err = new TTSError('MODEL_NOT_DOWNLOADED', 'No model');
    expect(err.retryable).toBe(false);
  });
});

describe('isAppError', () => {
  it('returns true for AuthError', () => {
    expect(isAppError(new AuthError('TOKEN_EXPIRED', 'test'))).toBe(true);
  });

  it('returns true for SyncError', () => {
    expect(isAppError(new SyncError('NETWORK_ERROR', 'test'))).toBe(true);
  });

  it('returns false for regular Error', () => {
    expect(isAppError(new Error('test'))).toBe(false);
  });

  it('returns false for non-error values', () => {
    expect(isAppError('string')).toBe(false);
    expect(isAppError(null)).toBe(false);
    expect(isAppError(undefined)).toBe(false);
  });
});

describe('getErrorMessage', () => {
  it('extracts message from Error', () => {
    expect(getErrorMessage(new Error('boom'))).toBe('boom');
  });

  it('returns string as-is', () => {
    expect(getErrorMessage('something failed')).toBe('something failed');
  });

  it('returns fallback for unknown types', () => {
    expect(getErrorMessage(42)).toBe('An unknown error occurred');
    expect(getErrorMessage(null)).toBe('An unknown error occurred');
  });
});
