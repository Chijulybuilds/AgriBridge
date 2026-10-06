import { QueryClient } from "@tanstack/react-query";

/** One cache for every page. Chain reads go stale quickly, so they refetch on focus and on an interval. */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      retry: 1,
    },
  },
});
