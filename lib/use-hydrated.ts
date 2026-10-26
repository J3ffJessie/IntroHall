"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * False during SSR and before hydration. Gate submit buttons on it: a form submitted before its
 * JS handlers attach does a native GET, putting field values (e.g. an email) in the URL.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(subscribe, () => true, () => false);
}
