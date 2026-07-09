import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '../config/env.js';

// Simple in-memory tables for development fallback
const mockNonces = new Map<string, any>();
const mockProfiles = new Map<string, any>();

// Pre-populate with realistic mock records so the app is populated out-of-the-box in mock mode
const mockCommodities = new Map<string, any>([
  [
    "c001",
    {
      id: "c001",
      on_chain_id: 101,
      farmer_wallet: "0x1234567890123456789012345678901234567890",
      commodity_type: "Cocoa",
      grade: "A",
      quantity_kg: 5000,
      harvest_date: "2026-06-10",
      storage_duration_days: 180,
      status: "Verified",
      token_id: 1001,
      verifier_wallet: "0xverifier123",
      created_at: new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString(),
      updated_at: new Date(Date.now() - 29 * 24 * 3600 * 1000).toISOString(),
    }
  ],
  [
    "c002",
    {
      id: "c002",
      on_chain_id: 102,
      farmer_wallet: "0x1234567890123456789012345678901234567890",
      commodity_type: "Yam",
      grade: "B",
      quantity_kg: 12000,
      harvest_date: "2026-05-15",
      storage_duration_days: 90,
      status: "Collateralized",
      token_id: 1002,
      verifier_wallet: "0xverifier123",
      created_at: new Date(Date.now() - 60 * 24 * 3600 * 1000).toISOString(),
      updated_at: new Date(Date.now() - 58 * 24 * 3600 * 1000).toISOString(),
    }
  ],
  [
    "c003",
    {
      id: "c003",
      on_chain_id: null,
      farmer_wallet: "0x1234567890123456789012345678901234567890",
      commodity_type: "Maize",
      grade: "A",
      quantity_kg: 8000,
      harvest_date: "2026-07-01",
      storage_duration_days: 120,
      status: "Pending",
      token_id: null,
      verifier_wallet: null,
      created_at: new Date(Date.now() - 5 * 24 * 3600 * 1000).toISOString(),
      updated_at: new Date(Date.now() - 5 * 24 * 3600 * 1000).toISOString(),
    }
  ],
  [
    "c004",
    {
      id: "c004",
      on_chain_id: 104,
      farmer_wallet: "0x1234567890123456789012345678901234567890",
      commodity_type: "Rice",
      grade: "C",
      quantity_kg: 3000,
      harvest_date: "2026-04-10",
      storage_duration_days: 270,
      status: "Rejected",
      token_id: null,
      verifier_wallet: "0xverifier123",
      created_at: new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString(),
      updated_at: new Date(Date.now() - 89 * 24 * 3600 * 1000).toISOString(),
    }
  ],
  [
    "c005",
    {
      id: "c005",
      on_chain_id: 105,
      farmer_wallet: "0x1234567890123456789012345678901234567890",
      commodity_type: "Cashew",
      grade: "B",
      quantity_kg: 4500,
      harvest_date: "2026-06-20",
      storage_duration_days: 180,
      status: "Verified",
      token_id: 1005,
      verifier_wallet: "0xverifier123",
      created_at: new Date(Date.now() - 15 * 24 * 3600 * 1000).toISOString(),
      updated_at: new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString(),
    }
  ],
  [
    "c006",
    {
      id: "c006",
      on_chain_id: null,
      farmer_wallet: "0x1234567890123456789012345678901234567890",
      commodity_type: "Cocoa",
      grade: "B",
      quantity_kg: 6200,
      harvest_date: "2026-07-05",
      storage_duration_days: 120,
      status: "Pending",
      token_id: null,
      verifier_wallet: null,
      created_at: new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString(),
      updated_at: new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString(),
    }
  ],
  [
    "c007",
    {
      id: "c007",
      on_chain_id: 107,
      farmer_wallet: "0x1234567890123456789012345678901234567890",
      commodity_type: "Maize",
      grade: "B",
      quantity_kg: 9500,
      harvest_date: "2026-05-30",
      storage_duration_days: 180,
      status: "Collateralized",
      token_id: 1007,
      verifier_wallet: "0xverifier123",
      created_at: new Date(Date.now() - 40 * 24 * 3600 * 1000).toISOString(),
      updated_at: new Date(Date.now() - 38 * 24 * 3600 * 1000).toISOString(),
    }
  ],
  [
    "c008",
    {
      id: "c008",
      on_chain_id: null,
      farmer_wallet: "0x1234567890123456789012345678901234567890",
      commodity_type: "Rice",
      grade: "A",
      quantity_kg: 7000,
      harvest_date: "2026-07-08",
      storage_duration_days: 180,
      status: "Pending",
      token_id: null,
      verifier_wallet: null,
      created_at: new Date(Date.now() - 1 * 24 * 3600 * 1000).toISOString(),
      updated_at: new Date(Date.now() - 1 * 24 * 3600 * 1000).toISOString(),
    }
  ],
  [
    "c009",
    {
      id: "c009",
      on_chain_id: 109,
      farmer_wallet: "0x1234567890123456789012345678901234567890",
      commodity_type: "Yam",
      grade: "A",
      quantity_kg: 11000,
      harvest_date: "2026-06-05",
      storage_duration_days: 90,
      status: "Verified",
      token_id: 1009,
      verifier_wallet: "0xverifier123",
      created_at: new Date(Date.now() - 35 * 24 * 3600 * 1000).toISOString(),
      updated_at: new Date(Date.now() - 34 * 24 * 3600 * 1000).toISOString(),
    }
  ],
  [
    "c010",
    {
      id: "c010",
      on_chain_id: null,
      farmer_wallet: "0x1234567890123456789012345678901234567890",
      commodity_type: "Cashew",
      grade: "C",
      quantity_kg: 3800,
      harvest_date: "2026-07-03",
      storage_duration_days: 120,
      status: "Pending",
      token_id: null,
      verifier_wallet: null,
      created_at: new Date(Date.now() - 4 * 24 * 3600 * 1000).toISOString(),
      updated_at: new Date(Date.now() - 4 * 24 * 3600 * 1000).toISOString(),
    }
  ]
]);

const isMock =
  env.SUPABASE_URL.includes('YOUR_PROJECT_REF') ||
  env.SUPABASE_SERVICE_ROLE_KEY.includes('your-service-role-secret-key');

class SupabaseQueryBuilderMock {
  private table: string;
  private filters: Array<{ col: string; val: any }> = [];
  private dataToInsert: any = null;
  private dataToUpdate: any = null;
  private upsertData: any = null;

  constructor(table: string) {
    this.table = table;
  }

  from(table: string) {
    return new SupabaseQueryBuilderMock(table);
  }

  insert(data: any) {
    this.dataToInsert = data;
    return this;
  }

  upsert(data: any, _options?: any) {
    this.upsertData = data;
    return this;
  }

  update(data: any) {
    this.dataToUpdate = data;
    return this;
  }

  select(_columns?: string) {
    return this;
  }

  delete() {
    this.dataToInsert = null;
    this.dataToUpdate = null;
    this.upsertData = null;
    return {
      eq: (col: string, val: any) => {
        const store = this.getStore();
        if (this.table === 'wallet_link_nonces' || this.table === 'auth_nonces') {
          store.delete(val.toLowerCase());
        } else {
          for (const [k, v] of store.entries()) {
            if (v[col] === val) {
              store.delete(k);
            }
          }
        }
        return Promise.resolve({ data: null, error: null });
      }
    };
  }

  eq(col: string, val: any) {
    this.filters.push({ col, val });
    return this;
  }

  order(_col: string, _options?: any) {
    return this;
  }

  maybeSingle() {
    return this.execute().then(res => ({
      data: res.data ? (Array.isArray(res.data) ? res.data[0] || null : res.data) : null,
      error: res.error
    }));
  }

  single() {
    return this.execute().then(res => {
      const item = res.data ? (Array.isArray(res.data) ? res.data[0] : res.data) : null;
      if (!item) {
        return { data: null, error: { message: 'Row not found', code: 'PGRST116' } };
      }
      return { data: item, error: res.error };
    });
  }

  // Support promise/await syntax directly on the builder instance
  then(onfulfilled?: (value: any) => any, onrejected?: (reason: any) => any) {
    return this.execute().then(onfulfilled, onrejected);
  }

  private getStore() {
    if (this.table === 'wallet_link_nonces' || this.table === 'auth_nonces') return mockNonces;
    if (this.table === 'profiles') return mockProfiles;
    return mockCommodities;
  }

  private async execute(): Promise<{ data: any; error: any }> {
    const store = this.getStore();

    // 1) Handle Insert
    if (this.dataToInsert) {
      const item = {
        id: Math.random().toString(36).substring(2, 11),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ...this.dataToInsert
      };
      if (this.table === 'profiles') {
        store.set(item.wallet_address.toLowerCase(), item);
      } else if (this.table === 'wallet_link_nonces' || this.table === 'auth_nonces') {
        store.set(item.wallet_address.toLowerCase(), item);
      } else {
        store.set(item.id, item);
      }
      return { data: item, error: null };
    }

    // 2) Handle Upsert
    if (this.upsertData) {
      const address = this.upsertData.wallet_address.toLowerCase();
      const existing = store.get(address) || {};
      const merged = { ...existing, ...this.upsertData, updated_at: new Date().toISOString() };
      store.set(address, merged);
      return { data: merged, error: null };
    }

    // 3) Handle Update
    if (this.dataToUpdate) {
      let updatedItem: any = null;
      let results = Array.from(store.values());
      
      for (const filter of this.filters) {
        results = results.filter(item => {
          const itemVal = item[filter.col];
          if (typeof itemVal === 'string' && typeof filter.val === 'string') {
            return itemVal.toLowerCase() === filter.val.toLowerCase();
          }
          return itemVal === filter.val;
        });
      }

      if (results.length > 0) {
        const matched = results[0];
        updatedItem = { ...matched, ...this.dataToUpdate, updated_at: new Date().toISOString() };
        
        if (this.table === 'profiles' || this.table === 'wallet_link_nonces' || this.table === 'auth_nonces') {
          store.set(updatedItem.wallet_address.toLowerCase(), updatedItem);
        } else {
          store.set(updatedItem.id, updatedItem);
        }
      }
      
      return { data: updatedItem, error: null };
    }

    // 4) Handle Read (Select)
    let results = Array.from(store.values());
    for (const filter of this.filters) {
      results = results.filter(item => {
        if (this.table === 'commodities' && filter.col === 'farmer_wallet') {
          // If the item has the default placeholder wallet address, make it visible to any authenticated user
          if (item.farmer_wallet === "0x1234567890123456789012345678901234567890") {
            return true;
          }
        }
        const itemVal = item[filter.col];
        if (typeof itemVal === 'string' && typeof filter.val === 'string') {
          return itemVal.toLowerCase() === filter.val.toLowerCase();
        }
        return itemVal === filter.val;
      });
    }

    return { data: results, error: null };
  }
}

const mockClient = {
  from(table: string) {
    return new SupabaseQueryBuilderMock(table);
  }
} as unknown as SupabaseClient;

if (isMock) {
  console.log('\n🔌 Supabase placeholders detected in .env. Using in-memory database mock mode.\n');
}

export const supabaseAdmin: SupabaseClient = isMock ? mockClient : createClient(
  env.SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

export function supabaseForUser(accessToken: string): SupabaseClient {
  if (isMock) return mockClient;
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
