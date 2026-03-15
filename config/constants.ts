export const GMAIL_API = {
  baseUrl: 'https://gmail.googleapis.com/gmail/v1/users/me',
  batchUrl: 'https://gmail.googleapis.com/batch/gmail/v1',
  quotaUnits: {
    messagesList: 5,
    messagesGet: 5,
    messagesSend: 100,
    threadsGet: 10,
    historyList: 2,
  },
};

export const GRAPH_API = {
  baseUrl: 'https://graph.microsoft.com/v1.0/me',
  throttleHeaders: {
    throttlePercentage: 'x-ms-throttle-limit-percentage',
    retryAfter: 'retry-after',
  },
  throttleThreshold: 80,
  cooldownMs: 30_000,
};

export const RATE_LIMIT = {
  maxRetries: 5,
  baseDelayMs: 1000,
  maxDelayMs: 30_000,
};
