"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";

const people = [
  { name: "Priya", tags: ["Rust", "GenAI"] },
  { name: "Mateo", tags: ["Startups", "GenAI"] },
  { name: "Kenji", tags: ["Climate tech", "Design"] },
  { name: "Zara", tags: ["Rust", "Startups"] },
  { name: "Amara", tags: ["Design", "GenAI"] },
  { name: "Leo", tags: ["Climate tech", "Rust"] },
];

// All positions are percentages of the (square) figure. "You" sits in the middle; matches branch off to the right,
// below and to the left, each overlapping "You" by LENS so their shared interests fit in the overlap.
const CENTER = { x: 50, y: 40 };
const R_YOU = 22;
const R_THEM = 18;
const LENS = 15;
const DIST = R_YOU + R_THEM - LENS;
const slots = [
  { dx: 1, dy: 0 },
  { dx: 0, dy: 1 },
  { dx: -1, dy: 0 },
];

const at = (dx: number, dy: number, d: number) => ({ left: `${CENTER.x + dx * d}%`, top: `${CENTER.y + dy * d}%` });

const pop = { type: "spring", stiffness: 380, damping: 24 } as const;

/**
 * Homepage hero: "You" in the middle, matches popping in around it (right, below, left) with the interests you share
 * in each overlap. Every beat the oldest match leaves and the next person takes its place. Reduced motion: the first
 * three matches, static.
 */
export function OverlapDemo() {
  const reduced = useReducedMotion();
  // step n shows people n-2..n in slots (n % 3); the first beats fill the slots one at a time.
  const [beat, setBeat] = useState(0);
  const step = reduced ? 2 : beat;

  useEffect(() => {
    if (reduced) return;
    const id = setInterval(() => setBeat((b) => b + 1), 1700);
    return () => clearInterval(id);
  }, [reduced]);

  const shown = slots.map((slot, i) => {
    // The newest person in slot i is the largest n <= step with n % 3 === i.
    const n = step - ((step - i) % 3 + 3) % 3;
    return n < 0 ? null : { slot, n, person: people[n % people.length] };
  });

  return (
    <figure className="relative mx-auto aspect-square w-full max-w-lg">
      <div className="absolute aspect-square -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-primary/45 bg-primary/12"
           style={{ ...at(0, 0, 0), width: `${R_YOU * 2}%` }} />

      <AnimatePresence>
        {shown.map((m) => m && (
          <motion.div key={m.n} className="absolute aspect-square rounded-full border-2 border-highlight/50 bg-highlight/12"
                      style={{ ...at(m.slot.dx, m.slot.dy, DIST), width: `${R_THEM * 2}%`, x: "-50%", y: "-50%" }}
                      initial={reduced ? false : { scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.4, opacity: 0, transition: { duration: 0.35 } }}
                      transition={pop} />
        ))}
      </AnimatePresence>

      <p className="absolute -translate-x-1/2 -translate-y-1/2 font-display text-lg font-bold text-primary" style={at(0, -1, R_YOU * 0.55)}>
        You
      </p>

      <AnimatePresence>
        {shown.map((m) => m && (
          <motion.div key={`label-${m.n}`} className="pointer-events-none absolute inset-0"
                      initial={reduced ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.2 } }}>
            <p className="absolute -translate-x-1/2 -translate-y-1/2 font-display text-sm font-semibold text-highlight-soft-fg"
               style={at(m.slot.dx, m.slot.dy, DIST + R_THEM * 0.45)}>
              {m.person.name}
            </p>
            <div className={`absolute flex -translate-x-1/2 -translate-y-1/2 items-center gap-1 ${m.slot.dy ? "flex-row" : "flex-col"}`}
                 style={at(m.slot.dx, m.slot.dy, R_YOU - LENS / 2)}>
              {m.person.tags.map((t, i) => (
                <motion.span key={t}
                             className="rounded-full bg-surface px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap shadow-sm ring-1 ring-border"
                             initial={reduced ? false : { opacity: 0, scale: 0.3 }} animate={{ opacity: 1, scale: 1 }}
                             transition={{ type: "spring", stiffness: 500, damping: 20, delay: reduced ? 0 : 0.2 + i * 0.12 }}>
                  {t}
                </motion.span>
              ))}
            </div>
          </motion.div>
        ))}
      </AnimatePresence>

      <figcaption className="sr-only">
        You share interests with several attendees, for example {people[0].name} ({people[0].tags.join(" and ")}) and{" "}
        {people[2].name} ({people[2].tags.join(" and ")}).
      </figcaption>
    </figure>
  );
}
