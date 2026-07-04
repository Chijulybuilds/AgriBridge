import 'dotenv/config';
import { z } from 'zod';

/**
 * Central, validated environment config. The app fails fast at boot if a
 * required variable is missing, so teammates get a clear error instead of a
 * confusing runtime crash later.
 */
const schema = z.object({
  PORT: z.coerce.number().default(4000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  // Supabase — also the auth provider (email/password + Google OAuth).
  // The frontend logs in with Supabase; the backend verifies its access token.
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  // Chain
  RPC_URL: z.string().url(),
  CHAIN_ID: z.coerce.number(),
  VERIFIER_PRIVATE_KEY: z.string().min(1),

  // Contract addresses
  COMMODITY_REGISTRY_ADDRESS: z.string().default(''),
  COMMODITY_VERIFIER_ADDRESS: z.string().default(''),
  COMMODITY_TOKEN_ADDRESS: z.string().default(''),
  COMMODITY_PRICE_ORACLE_ADDRESS: z.string().default(''),
  LENDING_POOL_ADDRESS: z.string().default(''),
  LIQUIDITY_SHARE_TOKEN_ADDRESS: z.string().default(''),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment configuration:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
