import 'dotenv/config';
import { z } from 'zod';

/**
 * Central, validated environment config. The app fails fast at boot if a
 * required variable is missing, so teammates get a clear error instead of a
 * confusing runtime crash later.
 */
const booleanish = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1');

const schema = z
  .object({
    PORT: z.coerce.number().default(4000),
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

    // Supabase holds the off-chain mirror of commodities and the profile table.
    // Identity itself comes from the wallet signature, not from Supabase Auth.
    SUPABASE_URL: z.string().url().optional(),
    SUPABASE_ANON_KEY: z.string().min(1).optional(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),

    /**
     * Run against in-memory fixtures instead of a real Supabase project.
     * This is deliberately explicit: the previous behaviour was to fall back to
     * mock storage whenever a Supabase call looked misconfigured, which meant a
     * broken production deployment silently served fake data instead of failing.
     */
    USE_MOCK_DB: booleanish.default('false'),

    // Session JWT issued after a verified wallet signature.
    JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
    JWT_EXPIRES_IN: z.string().default('24h'),

    // Bound into the signed message so a signature for another site cannot be replayed here.
    APP_DOMAIN: z.string().min(1).default('localhost:3000'),
    APP_URI: z.string().url().default('http://localhost:3000'),

    // Chain
    RPC_URL: z.string().url(),
    CHAIN_ID: z.coerce.number(),
    VERIFIER_PRIVATE_KEY: z.string().min(1),

    // Contract addresses. COMMODITY_VERIFIER_ADDRESS is intentionally absent:
    // no CommodityVerifier contract exists. Approval lives on CommodityRegistry.
    COMMODITY_REGISTRY_ADDRESS: z.string().default(''),
    COMMODITY_TOKEN_ADDRESS: z.string().default(''),
    COMMODITY_PRICE_ORACLE_ADDRESS: z.string().default(''),
    LENDING_POOL_ADDRESS: z.string().default(''),
    LIQUIDITY_SHARE_TOKEN_ADDRESS: z.string().default(''),
  })
  .superRefine((cfg, ctx) => {
    // A real database is required unless mock mode is explicitly requested.
    if (!cfg.USE_MOCK_DB) {
      for (const key of ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'] as const) {
        if (!cfg[key]) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: `${key} is required unless USE_MOCK_DB=true`,
          });
        }
      }
    }

    // Mock data must never be served from a production deployment.
    if (cfg.USE_MOCK_DB && cfg.NODE_ENV === 'production') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['USE_MOCK_DB'],
        message: 'USE_MOCK_DB cannot be enabled when NODE_ENV=production',
      });
    }
  });

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment configuration:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
