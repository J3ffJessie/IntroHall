export const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "localtest.me:3000";
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
export const PROTOCOL = ROOT_DOMAIN.includes("localtest.me") || ROOT_DOMAIN.startsWith("localhost") ? "http" : "https";
