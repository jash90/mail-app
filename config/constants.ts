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
