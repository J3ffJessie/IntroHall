"use client";

import { useEffect } from "react";

/** Registers /sw.js on the event origin. Service workers need a secure context (HTTPS or localhost). */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || !window.isSecureContext) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
  }, []);
  return null;
}
