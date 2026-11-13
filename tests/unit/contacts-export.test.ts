import { describe, expect, it } from "vitest";
import {
  cleanLinks, contactsFile, csvField, escapeVCardText, foldLine, isContactFormat, localDate, toCsv, toVCard,
  type ExportContact,
} from "@/lib/contacts-export";

const ctx = { eventName: "DevConf 2026", timeZone: "America/New_York" };
const ada: ExportContact = {
  fullName: "Ada Lovelace",
  headline: "Analyst, engines",
  company: "Babbage; Co",
  links: ["https://ada.dev", "https://linkedin.com/in/ada"],
  connectedAt: "2026-11-13T02:30:00Z", // still Nov 12 in New York
  note: "Talked RAG evals\nSend deck",
  chatUrl: "https://devconf.introhall.com/chat/0b6b2c1e-0000-4000-8000-000000000001",
};

/** Undoes RFC 6350 folding so assertions can look at logical lines. */
const unfold = (s: string) => s.replace(/\r\n /g, "");

describe("format helpers", () => {
  it("accepts only vcf and csv", () => {
    expect(isContactFormat("vcf")).toBe(true);
    expect(isContactFormat("csv")).toBe(true);
    expect(isContactFormat("json")).toBe(false);
    expect(isContactFormat(null)).toBe(false);
  });

  it("dates the connection in the event's time zone", () => {
    expect(localDate("2026-11-13T02:30:00Z", "America/New_York")).toBe("2026-11-12");
    expect(localDate("2026-11-13T02:30:00Z", "Europe/Berlin")).toBe("2026-11-13");
  });

  it("keeps only http(s) string links", () => {
    expect(cleanLinks(["https://a.dev", " http://b.dev ", "javascript:alert(1)", 42, null])).toEqual(["https://a.dev", "http://b.dev"]);
    expect(cleanLinks({ not: "an array" })).toEqual([]);
  });
});

describe("vCard", () => {
  it("escapes backslash, comma, semicolon and newlines", () => {
    expect(escapeVCardText("a\\b,c;d\ne\r\nf")).toBe("a\\\\b\\,c\\;d\\ne\\nf");
  });

  it("folds at 75 octets without splitting multi-byte characters", () => {
    const line = "NOTE:" + "é".repeat(80); // 2 bytes each
    const folded = foldLine(line);
    const enc = new TextEncoder();
    for (const part of folded.split("\r\n")) expect(enc.encode(part).length).toBeLessThanOrEqual(75);
    expect(unfold(folded)).toBe(line);
    expect(foldLine("FN:Short")).toBe("FN:Short");
  });

  it("writes one card per contact with name, org, title, links and the note", () => {
    const vcf = toVCard([ada, { ...ada, fullName: "Cher", company: "", headline: "", links: [], note: null, chatUrl: null }], ctx);
    expect(vcf.endsWith("\r\n")).toBe(true);
    expect(vcf).not.toMatch(/[^\r]\n/); // CRLF only
    const lines = unfold(vcf).split("\r\n");
    expect(lines.filter((l) => l === "BEGIN:VCARD")).toHaveLength(2);
    expect(lines).toContain("VERSION:3.0");
    expect(lines).toContain("FN:Ada Lovelace");
    expect(lines).toContain("N:Lovelace;Ada;;;");
    expect(lines).toContain("ORG:Babbage\\; Co");
    expect(lines).toContain("TITLE:Analyst\\, engines");
    expect(lines).toContain("URL:https://ada.dev");
    expect(lines).toContain("URL:https://linkedin.com/in/ada");
    expect(lines).toContain("CATEGORIES:DevConf 2026");
    expect(lines).toContain(
      "NOTE:Met at DevConf 2026 (connected 2026-11-12).\\n\\nTalked RAG evals\\nSend deck\\n\\n" +
      `IntroHall chat: ${ada.chatUrl}`);
    // Single-word names and empty fields.
    expect(lines).toContain("N:Cher;;;;");
    expect(lines).toContain("NOTE:Met at DevConf 2026 (connected 2026-11-12).");
    expect(lines.filter((l) => l.startsWith("ORG:"))).toHaveLength(1);
  });

  it("is empty for no contacts", () => {
    expect(toVCard([], ctx)).toBe("");
  });
});

describe("CSV", () => {
  it("quotes fields with commas, quotes and newlines", () => {
    expect(csvField("plain")).toBe("plain");
    expect(csvField("a,b")).toBe('"a,b"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    expect(csvField("two\nlines")).toBe('"two\nlines"');
  });

  it("neutralizes spreadsheet formulas", () => {
    expect(csvField("=HYPERLINK(\"http://evil\")")).toBe("\"'=HYPERLINK(\"\"http://evil\"\")\"");
    expect(csvField("+1 555")).toBe("'+1 555");
    expect(csvField("-x")).toBe("'-x");
    expect(csvField("@sum")).toBe("'@sum");
  });

  it("has a BOM, a header row and one row per contact", () => {
    const csv = toCsv([ada], ctx);
    expect(csv.startsWith("﻿Name,Headline,Company,Links,Event,Connected,Note,Chat\r\n")).toBe(true);
    expect(csv).toContain(
      `Ada Lovelace,"Analyst, engines",Babbage; Co,https://ada.dev https://linkedin.com/in/ada,DevConf 2026,2026-11-12,` +
      `"Talked RAG evals\nSend deck",${ada.chatUrl}\r\n`);
  });
});

describe("contactsFile", () => {
  it("picks content type and filename by format", () => {
    expect(contactsFile("vcf", "devconf", [ada], ctx)).toMatchObject({
      contentType: "text/vcard; charset=utf-8", filename: "introhall-devconf-contacts.vcf" });
    expect(contactsFile("csv", "devconf", [ada], ctx)).toMatchObject({
      contentType: "text/csv; charset=utf-8", filename: "introhall-devconf-contacts.csv" });
  });
});
