import { describe, expect, it } from "vitest";
import { scrubPath, scrubUrl } from "@/lib/monitoring";

describe("scrubbing", () => {
  it("drops join codes, ids and invite tokens", () => {
    expect(scrubUrl("https://devconf.introhall.com/?c=ABCDEFGH23")).toBe("https://devconf.introhall.com/");
    expect(scrubUrl("https://devconf.introhall.com/chat/0f8b6c1e-4a7d-4c55-9a38-2d1f5e7b9c10#m"))
      .toBe("https://devconf.introhall.com/chat/:id");
    expect(scrubPath("/invite/s3cr3t-token_x")).toBe("/invite/:token");
    expect(scrubUrl("/dashboard/events/0F8B6C1E-4A7D-4C55-9A38-2D1F5E7B9C10/analytics?x=1"))
      .toBe("/dashboard/events/:id/analytics");
  });
});
