import confetti from "canvas-confetti";

const brand = ["#6d28d9", "#a78bfa", "#f97316", "#fdba74", "#facc15"];

/** A short celebratory burst (Magic UI's Confetti). No-op for people who prefer reduced motion. */
export function celebrate(origin?: { x: number; y: number }) {
  if (typeof window === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  void confetti({ particleCount: 90, spread: 70, startVelocity: 38, ticks: 160, colors: brand, origin: origin ?? { y: 0.7 } });
}

/** Burst origin at an element's center, in viewport fractions. */
export function originOf(el: Element) {
  const r = el.getBoundingClientRect();
  return { x: (r.left + r.width / 2) / window.innerWidth, y: (r.top + r.height / 2) / window.innerHeight };
}
