"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

/** Rises into place on first render; `index` staggers siblings in a list. */
export function FadeIn({ children, index = 0, className }: { children: ReactNode; index?: number; className?: string }) {
  const reduced = useReducedMotion();
  return (
    <motion.div className={className}
                initial={reduced ? false : { opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ type: "spring", stiffness: 260, damping: 26, delay: Math.min(index, 8) * 0.05 }}>
      {children}
    </motion.div>
  );
}
