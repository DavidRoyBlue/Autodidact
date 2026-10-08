import { useCallback, useRef } from 'react';
import { useFocusEffect } from 'expo-router';

/**
 * Refetch when the screen regains focus. Tabs and stacked screens stay
 * mounted, so React Query never refetches on its own when you come back.
 * The first focus is skipped: the mount already fetched.
 */
export function useRefreshOnFocus(refetch: () => unknown) {
  const latest = useRef(refetch);
  latest.current = refetch;
  const firstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (firstFocus.current) {
        firstFocus.current = false;
        return;
      }
      void latest.current();
    }, []),
  );
}
