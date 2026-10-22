import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * The Supabase project the app talks to. The publishable key is safe to ship in the
 * bundle: without it the app stays local, with the bundled vocabulary and no account.
 */
const DEFAULT_URL = 'https://iyxolajfrjgqpazvonwm.supabase.co';
const SUPABASE_URL = (import.meta.env && import.meta.env.VITE_SUPABASE_URL) || DEFAULT_URL;
const SUPABASE_KEY: string | undefined =
  import.meta.env && import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const isCloudEnabled = Boolean(SUPABASE_KEY);

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (!SUPABASE_KEY) return null;
  client ??= createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  return client;
}
