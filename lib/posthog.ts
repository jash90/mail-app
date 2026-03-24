import PostHog from 'posthog-react-native';

export const posthog = new PostHog(
  'phc_wybvzqy02FyInowhsfv9fQnH7hS6jFjQMfzbv7EUAD5',
  {
    host: 'https://us.i.posthog.com',
    enableSessionReplay: true,
  },
);
