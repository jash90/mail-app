import { QueryClient } from '@tanstack/react-query';

const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
const FIVE_MINUTES = 5 * 60 * 1000;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: FIVE_MINUTES,
      gcTime: TWENTY_FOUR_HOURS,
    },
  },
});
