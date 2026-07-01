import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '../config/env.js';

/**
 * Two clients, two trust levels:
 *
 *  - `supabaseAdmin` uses the SERVICE ROLE key. It bypasses Row Level Security
 *    and is used only by trusted server code (e.g. writing the mirror row after
 *    an on-chain verification succeeds). Never expose this to the frontend.
 *
 *  - `supabaseForUser(token)` builds a request-scoped client that carries the
 *    end user's Supabase JWT, so Postgres RLS policies apply as that user.
 */
export const supabaseAdmin: SupabaseClient = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

export function supabaseForUser(accessToken: string): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
