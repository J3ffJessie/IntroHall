import { describe, expect, it } from "vitest";
import { bannerLayout } from "@/lib/banner";

describe("bannerLayout", () => {
  it.each([
    [1600, 400, 4],
    [1500, 500, 3],
    [1200, 600, 2],
    [2000, 400, 5],
  ])("%ix%i fills the area exactly at its own ratio", (w, h, ratio) => {
    expect(bannerLayout(w, h)).toEqual({ ratio, exact: true });
  });

  it.each([
    [1200, 630, 2], // link-preview shape (1.9:1) → shown whole over a backdrop
    [1080, 1080, 2], // square
    [800, 1200, 2], // portrait
    [3000, 300, 5], // 10:1 panorama
  ])("%ix%i is clamped to %i:1 and shown whole over a backdrop", (w, h, ratio) => {
    expect(bannerLayout(w, h)).toEqual({ ratio, exact: false });
  });

  it("uses a safe default when the size is unknown", () => {
    expect(bannerLayout(null, null)).toEqual({ ratio: 3, exact: false });
  });
});
