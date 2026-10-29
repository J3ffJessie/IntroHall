import { defineConfig } from "vitest/config";
import path from "node:path";

// Runs against the local Supabase Postgres (pnpm db:start).
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname) } },
  // One file at a time: the join test alone opens 60 connections against a 100-connection local Postgres.
  test: { include: ["tests/integration/**/*.test.ts"], environment: "node", testTimeout: 120_000, fileParallelism: false },
});
