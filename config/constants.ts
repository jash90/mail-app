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

export const AI = {
  model: 'glm-4.7-flashx',
  temperature: 0.7,
  timeoutMs: 300_000,
};

export const RATE_LIMIT = {
  maxRetries: 5,
  baseDelayMs: 1000,
  maxDelayMs: 30_000,
};
