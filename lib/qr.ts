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

/** Personal connect URL in an attendee's own QR code: scanning it opens the connect confirm screen. */
export function connectUrl(slug: string, rootDomain: string, protocol: string, token: string): string {
  return `${protocol}://${slug}.${rootDomain}/c/${encodeURIComponent(token)}`;
}

/** Cookie (event host only) that carries a scanned code through sign-in, join and profile setup. */
export const PENDING_CONNECT_COOKIE = "ih_connect";
