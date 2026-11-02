"use client";

import { useInView, useMotionValue, useReducedMotion, useSpring } from "motion/react";
import { useEffect, useRef } from "react";

/** Counts up to `value` once on screen (Magic UI's NumberTicker), in compact notation. */
const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
const format = (n: number) => compact.format(n);

export function NumberTicker({ value }: { value: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduced = useReducedMotion();
  const motionValue = useMotionValue(reduced ? value : 0);
  const spring = useSpring(motionValue, { damping: 60, stiffness: 100 });
  const inView = useInView(ref, { once: true });

  useEffect(() => { if (inView) motionValue.set(value); }, [inView, motionValue, value]);
  useEffect(() => spring.on("change", (n) => {
    if (ref.current) ref.current.textContent = format(Math.round(n));
  }), [spring]);

  return <span ref={ref}>{format(reduced ? value : 0)}</span>;
}
