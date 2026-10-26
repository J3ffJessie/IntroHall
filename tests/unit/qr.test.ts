import jsQR from "jsqr";
import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";
import { joinUrl, qrPngDataUrl, qrSvg } from "@/lib/qr";

describe("joinUrl", () => {
  it("open mode", () => expect(joinUrl("devconf", "introhall.com")).toBe("https://devconf.introhall.com/"));
  it("code mode", () =>
    expect(joinUrl("devconf", "introhall.com", "https", "ABCDE23456")).toBe("https://devconf.introhall.com/?c=ABCDE23456"));
});

describe("QR images", () => {
  it.each([
    joinUrl("devconf", "introhall.com"),
    joinUrl("devconf", "introhall.com", "https", "ABCDE23456"),
  ])("the 1024px PNG decodes to exactly %s", async (url) => {
    const dataUrl = await qrPngDataUrl(url);
    const png = PNG.sync.read(Buffer.from(dataUrl.split(",")[1], "base64"));
    expect(png.width).toBe(1024);
    expect(jsQR(new Uint8ClampedArray(png.data), png.width, png.height)?.data).toBe(url);
  });
  it("produces an SVG", async () => expect(await qrSvg("https://x.introhall.com/")).toMatch(/^<svg/));
});
