import QRCode from "qrcode";

/** Join URL encoded in the printed QR code (§4.2). */
export function joinUrl(slug: string, rootDomain: string, protocol = "https", code?: string | null): string {
  const base = `${protocol}://${slug}.${rootDomain}/`;
  return code ? `${base}?c=${encodeURIComponent(code)}` : base;
}

const options = { errorCorrectionLevel: "H" as const, margin: 2 };

export function qrSvg(url: string): Promise<string> {
  return QRCode.toString(url, { ...options, type: "svg" });
}

/** 1024 px PNG as a data URL (browser-safe). */
export function qrPngDataUrl(url: string): Promise<string> {
  return QRCode.toDataURL(url, { ...options, width: 1024 });
}
