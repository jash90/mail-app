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
  /** Active cloud backend: 'zai' | 'openrouter' (set via EXPO_PUBLIC_AI_BACKEND) */
  backend: (process.env.EXPO_PUBLIC_AI_BACKEND ?? 'zai') as
    | 'zai'
    | 'openrouter',

  zai: {
    model: process.env.EXPO_PUBLIC_ZAI_MODEL ?? 'glm-4-flashx',
    baseUrl: 'https://api.z.ai/api/coding/paas/v4',
  },

  openrouter: {
    model: process.env.EXPO_PUBLIC_OPENROUTER_MODEL ?? 'qwen/qwen3.6-plus:free',
    baseUrl: 'https://openrouter.ai/api/v1',
  },

  temperature: 0.7,
  timeoutMs: 300_000,
};

export const RATE_LIMIT = {
  maxRetries: 5,
  baseDelayMs: 1000,
  maxDelayMs: 30_000,
};

export const GOOGLE_AUTH = {
  iosClientId:
    '510423566915-edi6sd1aqhcs4flbbcsdht22sfre9tsf.apps.googleusercontent.com',
  scopes: [
    'https://www.googleapis.com/auth/gmail.modify',
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/contacts.readonly',
  ],
};
