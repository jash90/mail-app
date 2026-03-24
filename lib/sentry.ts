import * as Sentry from '@sentry/react-native';

export function initSentry() {
  Sentry.init({
    dsn: 'https://7dd2917b82274f2c91c424314e230055@o303506.ingest.us.sentry.io/4511101258498048',
    tracesSampleRate: 0.2,
    enableAutoSessionTracking: true,
    attachScreenshot: true,
  });
}

export { Sentry };
