import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./database.types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://build-placeholder.supabase.co";
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "sb_publishable_build_placeholder";

export function createClient() {
  return createBrowserClient<Database>(url, key);
}
