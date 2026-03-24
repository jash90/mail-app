import * as Sentry from '@sentry/react-native';
import { isRunningInExpoGo } from 'expo';

const navigationIntegration = Sentry.reactNavigationIntegration({
  enableTimeToInitialDisplay: !isRunningInExpoGo(),
});

export function initSentry() {
  Sentry.init({
    dsn: 'https://7dd2917b82274f2c91c424314e230055@o303506.ingest.us.sentry.io/4511101258498048',
    tracesSampleRate: 0.2,
    enableAutoSessionTracking: true,
    attachScreenshot: true,
    enableUserInteractionTracing: true,
    enableNativeFramesTracking: !isRunningInExpoGo(),
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
    integrations: [
      navigationIntegration,
      Sentry.mobileReplayIntegration(),
    ],
  });
}

export { Sentry, navigationIntegration };
