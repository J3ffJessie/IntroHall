import { describe, expect, it } from "vitest";
import type { EventAnalytics } from "@/lib/analytics";
import { analyticsCsv, analyticsFilename, eventHasEnded, localDateTime, summaryHighlights } from "@/lib/analytics-export";

const data = (over: Partial<EventAnalytics> = {}): EventAnalytics => ({
  joined: 40, completed: 30, active: 35, left: 3, removed: 2,
  requests_sent: 50, requests_accepted: 20, conversations_started: 12,
  joins_by_hour: [{ hour: "2026-11-03T10:00", joins: 4 }, { hour: "2026-11-03T09:00", joins: 25 }],
  top_tags: [{ label: "Rust", attendees: 20, hidden: false }, { label: "Spam", attendees: 9, hidden: true },
             { label: "Go", attendees: 8, hidden: false }],
  open_to: [{ intent: "hiring", attendees: 6 }, { intent: "job_seeking", attendees: 4 }],
  ...over,
});
const event = { name: "Rust Summit", slug: "rust-summit", starts_at: "2026-11-03T14:00:00Z",
                ends_at: "2026-11-03T23:00:00Z", timezone: "America/New_York" };

describe("analyticsCsv", () => {
  const csv = analyticsCsv(data(), [{ label: "Rust", attendees: 20 }, { label: "Go", attendees: 8 }, { label: "Elm", attendees: 0 }],
                           event, new Date("2026-11-04T15:30:00Z"));
  const lines = csv.replace(/^﻿/, "").trimEnd().split("\r\n");

  it("starts with a BOM and a header, using CRLF", () => {
    expect(csv.startsWith("﻿Section,Item,Value\r\n")).toBe(true);
    expect(csv.endsWith("\r\n")).toBe(true);
  });
  it("puts event times in the event's time zone", () => {
    expect(lines).toContain("Event,Starts,2026-11-03 09:00");
    expect(lines).toContain("Event,Exported,2026-11-04 10:30");
  });
  it("includes totals and percentages", () => {
    expect(lines).toContain("Attendance,Joined,40");
    expect(lines).toContain("Attendance,Completed profiles (% of joined),75");
    expect(lines).toContain("Networking,Accepted (% of sent),40");
  });
  it("lists joins by hour in order, every interest (even with no one), and Open to labels", () => {
    const hours = lines.filter((l) => l.startsWith("Joins by hour"));
    expect(hours).toEqual(["Joins by hour,2026-11-03 09:00,25", "Joins by hour,2026-11-03 10:00,4"]);
    expect(lines).toContain("Interests,Elm,0");
    expect(lines).toContain("Open to,Looking for work,4");
  });
  it("leaves a percentage blank when there is nothing to divide by", () => {
    const empty = analyticsCsv(data({ joined: 0, completed: 0, requests_sent: 0, requests_accepted: 0 }), [], event);
    expect(empty).toContain("Networking,Accepted (% of sent),\r\n");
  });
  it("escapes commas and neutralizes spreadsheet formulas in labels", () => {
    const out = analyticsCsv(data(), [{ label: "=HYPERLINK(\"x\")", attendees: 1 }, { label: "AI, ML", attendees: 2 }],
                             { ...event, name: "Summit, 2026" });
    expect(out).toContain(`Interests,"'=HYPERLINK(""x"")",1`);
    expect(out).toContain(`Interests,"AI, ML",2`);
    expect(out).toContain(`Event,Name,"Summit, 2026"`);
  });
  it("names the file after the event", () => {
    expect(analyticsFilename("rust-summit")).toBe("introhall-rust-summit-analytics.csv");
  });
});

describe("localDateTime", () => {
  it("handles midnight as 00, not 24", () => {
    expect(localDateTime("2026-11-04T05:00:00Z", "America/New_York")).toBe("2026-11-04 00:00");
  });
});

describe("eventHasEnded", () => {
  const now = new Date("2026-11-04T00:00:00Z");
  it("after the end time, or once archived", () => {
    expect(eventHasEnded({ ends_at: "2026-11-03T23:00:00Z", status: "published" }, now)).toBe(true);
    expect(eventHasEnded({ ends_at: "2026-11-05T23:00:00Z", status: "published" }, now)).toBe(false);
    expect(eventHasEnded({ ends_at: "2026-11-05T23:00:00Z", status: "archived" }, now)).toBe(true);
  });
});

describe("summaryHighlights", () => {
  it("summarizes the event in plain language", () => {
    expect(summaryHighlights(data())).toEqual([
      "40 people joined and 30 (75%) completed a profile.",
      "50 connection requests sent; 20 accepted (40%).",
      "12 conversations started.",
      "Busiest hour for joining: Nov 3, 9 AM, with 25 joins.",
      "Most popular interests: Rust (20), Go (8).",
      "Most people were open to: Hiring (6), Looking for work (4).",
      "3 people left the event; 2 people were removed.",
    ]);
  });
  it("skips hidden interests and empty sections, and uses singulars", () => {
    expect(summaryHighlights(data({
      joined: 1, completed: 1, left: 0, removed: 1, requests_sent: 0, requests_accepted: 0, conversations_started: 0,
      joins_by_hour: [{ hour: "2026-11-03T09:00", joins: 1 }], top_tags: [{ label: "Spam", attendees: 1, hidden: true }], open_to: [],
    }))).toEqual([
      "1 person joined and 1 (100%) completed a profile.",
      "No connection requests were sent.",
      "1 person was removed.",
    ]);
  });
  it("handles an event no one joined", () => {
    expect(summaryHighlights(data({ joined: 0 }))).toEqual(["No one joined this event."]);
  });
});
