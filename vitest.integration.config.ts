import { defineConfig } from "vitest/config";
import path from "node:path";

// Runs against the local Supabase Postgres (pnpm db:start).
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname) } },
  test: { include: ["tests/integration/**/*.test.ts"], environment: "node", testTimeout: 120_000 },
});
