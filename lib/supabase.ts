/**
 * Supabase client - removed in no-backend version.
 * 
 * After removing the backend, we no longer need Supabase for:
 * - Session storage (now using localStorage with signed SIWE)
 * - Commodity mirroring (all on-chain)
 * - User profiles (stored in localStorage)
 */

// This file is kept for potential future use with a different backendless approach
// All data is now stored on-chain and in browser localStorage

export const supabase = null;

export function getSupabaseClient() {
  return null;
}
