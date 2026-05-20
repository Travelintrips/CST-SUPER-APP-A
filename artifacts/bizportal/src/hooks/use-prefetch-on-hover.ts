import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { QueryFunction, QueryKey } from "@tanstack/react-query";

export interface PrefetchOptions {
  queryKey: QueryKey;
  queryFn: QueryFunction<unknown>;
}

export function usePrefetchOnHover(delay = 150) {
  const queryClient = useQueryClient();

  return useCallback(
    (opts: PrefetchOptions) => {
      let timerId: ReturnType<typeof setTimeout> | null = null;

      const onMouseEnter = () => {
        timerId = setTimeout(() => {
          queryClient.prefetchQuery(opts);
        }, delay);
      };

      const onMouseLeave = () => {
        if (timerId !== null) {
          clearTimeout(timerId);
          timerId = null;
        }
      };

      return { onMouseEnter, onMouseLeave };
    },
    [queryClient, delay],
  );
}
