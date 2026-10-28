export const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "localtest.me:3000";
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
// Local dev is plain HTTP unless started with `pnpm dev:https` (needed for service workers and push).
const LOCAL = ROOT_DOMAIN.includes("localtest.me") || ROOT_DOMAIN.startsWith("localhost");
export const PROTOCOL = LOCAL && process.env.NEXT_PUBLIC_DEV_HTTPS !== "1" ? "http" : "https";
