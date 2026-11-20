"use client";

import { useEffect, useState } from "react";

/**
 * True after mount. Server and the first client render are both false so
 * localStorage-derived UI stays aligned through hydration.
 */
export function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    // Mount gate: defer localStorage-derived UI until after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional SSR alignment
    setHydrated(true);
  }, []);

  return hydrated;
}
