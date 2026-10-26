import { expect, it } from "vitest";
import { normalizeTagLabel, tagKey } from "@/lib/tags";

it("normalizes the plan's examples to the same key", () => {
  expect(tagKey("  Machine   Learning")).toBe("machine learning");
  expect(tagKey("ＭＡＣＨＩＮＥ learning")).toBe("machine learning");
  expect(normalizeTagLabel("  Machine   Learning")).toBe("Machine Learning");
});
