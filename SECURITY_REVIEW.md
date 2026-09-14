# AgriBridge Security & Code Quality Review

**Review Date:** September 14, 2026  
**Built with:** Claude Opus 5  
**Status:** CRITICAL VULNERABILITIES FOUND

---

## Executive Summary

The AgriBridge codebase demonstrates solid architectural decisions with good separation of concerns, proper error handling, and strong contract security practices (ReentrancyGuard, AccessControl). However, **CRITICAL security vulnerabilities have been discovered**, primarily around credential management and environment handling. These must be resolved immediately before any production deployment.

---

## 🔴 CRITICAL VULNERABILITIES

### 1. **Exposed Private Keys in Version Control** ⚠️ CRITICAL
**Severity:** CRITICAL | **File:** `.env`, `backend/.env`  
**Issue:** The `.env` and `backend/.env` files contain actual private keys and are committed to the repository.

```
.env:
PRIVATE_KEY=f42f9065336203e06f25c502fd462f769f30223fd2bdfe1b5492562685f9e7fa
PRIVATE_KEY_2=3df23c49f9cf32ceaca67c9d135f979c75db76591ce4630157410d1ea17343df

backend/.env:
VERIFIER_PRIVATE_KEY=0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d
```

**Risks:**
- Complete wallet compromise for deployer and verifier accounts
- Potential theft of all protocol assets and borrowed funds
- Unauthorized transaction signing
- Loss of farmer and investor funds

**Remediation:**
```bash
# 1. IMMEDIATELY revoke all exposed private keys
# 2. Generate new keys and redeployment all contracts
# 3. Rotate all verifier and admin wallets

# Force remove from git history (careful operation)
git filter-branch --tree-filter 'rm -f .env backend/.env' HEAD

# Or use git-filter-repo (recommended)
git filter-repo --invert-paths --path .env --path backend/.env
```

### 2. **No CORS Origin Validation** ⚠️ CRITICAL
**Severity:** CRITICAL | **File:** `backend/src/app.ts`  
**Issue:** CORS is enabled with default wildcard settings, allowing any domain to access the API.

```typescript
app.use(cors()); // ❌ Allows ALL origins
```

**Risks:**
- Cross-site request forgery (CSRF) from malicious sites
- Session token theft via JavaScript execution
- API abuse from any domain
- Unauthorized transactions signed by victim users

**Fix:**
```typescript
// In backend/src/app.ts
app.use(
  cors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') ?? ['http://localhost:3000'],
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86400,
  })
);

// Add to backend/.env.example:
// ALLOWED_ORIGINS=http://localhost:3000,https://agribridge.io
```

### 3. **JWT Stored in localStorage** ⚠️ HIGH
**Severity:** HIGH | **File:** `lib/auth.ts`  
**Issue:** JWT tokens are stored in localStorage, vulnerable to XSS attacks.

```typescript
function persistSession(token: string, profile: Profile) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SESSION_STORAGE_KEY, token); // ❌ XSS vulnerable
  window.localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
}
```

**Risks:**
- XSS injection can steal the entire JWT
- No automatic cleanup on browser close
- Persistent access even after logout

**Fix:**
```typescript
// Use httpOnly cookies via backend (secure from XSS):
// Set these headers in backend/src/app.ts after successful auth:
res.cookie('agribridge_session', token, {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  maxAge: 24 * 60 * 60 * 1000, // 24h
});

// Remove localStorage usage, use server-side session management
```

### 4. **No Rate Limiting on Auth Endpoints** ⚠️ HIGH
**Severity:** HIGH | **Endpoints:** `/api/account/wallet/nonce`, `/api/account/wallet/auth`  
**Issue:** Authentication endpoints lack rate limiting, enabling brute force attacks.

```typescript
router.post('/account/wallet/nonce', asyncHandler(authController.nonce)); // No rate limit
router.post('/account/wallet/auth', asyncHandler(authController.verify)); // No rate limit
```

**Risks:**
- Nonce enumeration attacks
- Signature brute forcing (if combined with off-chain signature collection)
- DoS on auth service

**Fix:**
```bash
npm install express-rate-limit
```

```typescript
// backend/src/middleware/rateLimit.ts
import rateLimit from 'express-rate-limit';

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 requests per window
  message: 'Too many authentication attempts, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => process.env.NODE_ENV === 'development',
});

// Apply in routes:
router.post('/account/wallet/nonce', authLimiter, asyncHandler(authController.nonce));
router.post('/account/wallet/auth', authLimiter, asyncHandler(authController.verify));
```

---

## 🟡 HIGH PRIORITY ISSUES

### 5. **No Input Validation on Contract Calls**
**Severity:** HIGH | **File:** `backend/src/controllers/verifier.controller.ts`  
**Issue:** No validation that approved commodity exists on-chain before minting.

```typescript
// Missing verification that commodity exists in registry
async approve(req: AuthedRequest, res: Response) {
  const { id } = req.params;
  // No check: does commodity with id exist? Is it Pending?
  const tx = await chainService.approveCommodity(id);
}
```

**Fix:**
```typescript
async approve(req: AuthedRequest, res: Response) {
  const { id } = req.params;
  
  // Validate commodity exists and is pending
  const commodity = await chainService.getCommodity(id);
  if (!commodity) throw new NotFoundError('Commodity not found');
  if (commodity.status !== CommodityStatus.Pending) {
    throw new BadRequestError('Commodity must be in Pending status');
  }
  
  const tx = await chainService.approveCommodity(id);
  res.json({ transaction: tx });
}
```

### 6. **Missing Environment Validation**
**Severity:** HIGH | **File:** `backend/src/config/env.ts`  
**Issue:** Contract addresses default to empty strings instead of failing.

```typescript
COMMODITY_REGISTRY_ADDRESS: z.string().default(''), // ❌ Defaults to empty
COMMODITY_TOKEN_ADDRESS: z.string().default(''),
```

**Fix:**
```typescript
// backend/src/config/env.ts
COMMODITY_REGISTRY_ADDRESS: z.string().min(42).regex(/^0x[a-fA-F0-9]{40}$/),
COMMODITY_TOKEN_ADDRESS: z.string().min(42).regex(/^0x[a-fA-F0-9]{40}$/),
COMMODITY_PRICE_ORACLE_ADDRESS: z.string().min(42).regex(/^0x[a-fA-F0-9]{40}$/),
LENDING_POOL_ADDRESS: z.string().min(42).regex(/^0x[a-fA-F0-9]{40}$/),
LIQUIDITY_SHARE_TOKEN_ADDRESS: z.string().min(42).regex(/^0x[a-fA-F0-9]{40}$/),
```

### 7. **No Transaction Hash Tracking**
**Severity:** HIGH | **Issue:** No way to verify a transaction was actually mined or track it.

```typescript
const tx = await chainService.approveCommodity(id);
// tx might be undefined or invalid, no validation
```

**Fix:**
```typescript
async approveCommodity(commodityId: string): Promise<{ hash: string; confirmations: number }> {
  // Get current gas price
  const feeData = await provider.getFeeData();
  
  const tx = await verifierWallet.sendTransaction({
    to: commodityRegistry.address,
    data: /* encoded call */,
    gasLimit: 300000,
    gasPrice: feeData.gasPrice,
  });
  
  // Wait for confirmation
  const receipt = await tx.wait(1); // Wait for 1 block confirmation
  
  if (!receipt) throw new Error('Transaction failed');
  
  return {
    hash: tx.hash,
    confirmations: receipt.confirmations,
  };
}
```

### 8. **Insufficient Access Control on Admin Functions**
**Severity:** HIGH | **File:** `backend/src/middleware/auth.ts`  
**Issue:** Role-based access control (RBAC) relies only on on-chain verification but doesn't sync properly.

```typescript
// No database role verification
if (!roles.includes(req.user.role)) {
  return res.status(403).json({ error: 'Insufficient role' });
}
```

**Issue:** If the database is compromised, a farmer could escalate to admin.

**Fix:**
```typescript
export async function requireRole(...roles: UserRole[]) {
  return async (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
    
    // Re-fetch role from database to prevent escalation
    const profile = await profileService.getByWallet(req.user.wallet);
    if (!profile || !roles.includes(profile.role)) {
      return res.status(403).json({ error: 'Insufficient role' });
    }
    
    req.user.role = profile.role; // Update with fresh data
    next();
  };
}
```

---

## 🟠 MEDIUM PRIORITY ISSUES

### 9. **No Error Detail Filtering in Production**
**Severity:** MEDIUM | **File:** `backend/src/middleware/errorHandler.ts`  
**Issue:** Database errors might leak internal schema information.

```typescript
const message =
  process.env.NODE_ENV === "production"
    ? "Internal server error"
    : err instanceof Error
      ? err.message // ❌ Shows database schema in dev
      : "Internal server error";
```

**Improvement:** Log errors securely and return sanitized messages.

```typescript
const errorId = crypto.randomUUID();
console.error(`[${errorId}] Unhandled error:`, err);

const message = 
  process.env.NODE_ENV === 'production'
    ? `Internal server error (reference: ${errorId})`
    : err instanceof Error ? err.message : 'Internal server error';
```

### 10. **Missing Request Body Size Limits**
**Severity:** MEDIUM | **File:** `backend/src/app.ts`  
**Issue:** No limit on JSON payload size, enabling DoS.

```typescript
app.use(express.json()); // ❌ No size limit
```

**Fix:**
```typescript
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ limit: '10kb', extended: false }));
```

### 11. **Nonce TTL is Short (10 minutes)**
**Severity:** MEDIUM | **File:** `backend/src/services/auth.service.ts`  
**Issue:** 10-minute nonce TTL may be too short for slow/mobile users.

```typescript
const NONCE_TTL_MS = 10 * 60_000; // 10 minutes
```

**Suggestion:** Increase to 30 minutes for better UX while maintaining security.

### 12. **Missing Signature Uniqueness Check**
**Severity:** MEDIUM | **Issue:** No tracking of used signatures (signature replay within nonce window).

**Fix:** Add to database:
```sql
CREATE TABLE signature_log (
  id UUID PRIMARY KEY,
  wallet_address TEXT NOT NULL,
  signature TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL,
  UNIQUE(wallet_address, signature)
);
```

### 13. **No HTTPS Requirement in Wallet Sign Message**
**Severity:** MEDIUM | **Issue:** APP_URI can be http in production.

```typescript
APP_URI: z.string().url().default('http://localhost:3000'),
```

**Fix:**
```typescript
APP_URI: z.string().url().refine(
  (url) => 
    process.env.NODE_ENV === 'production' 
      ? url.startsWith('https://') 
      : true,
  { message: 'APP_URI must use HTTPS in production' }
),
```

---

## 🟢 LOW PRIORITY ISSUES / CODE QUALITY

### 14. **Hardcoded Decimal Constants**
**Severity:** LOW | **Issue:** Repeated decimal constants across services.

```typescript
// Better to centralize
export const CONSTANTS = {
  USDC_DECIMALS: 6,
  COMMODITY_QUANTITY_DECIMALS: 18,
  ORACLE_PRICE_DECIMALS: 8,
  RATE_DECIMALS: 18,
} as const;
```

### 15. **Missing JSDoc on Critical Functions**
**Severity:** LOW | **Issue:** Key functions lack proper documentation.

**Recommendation:** Add JSDoc to:
- `authService.verify()`
- `commodityService.create()`
- `verifierController.approve()`

### 16. **No TypeScript strict null checks**
**Severity:** LOW | **Suggestion:** Enable `strict: true` and `strictNullChecks: true` in `tsconfig.json` to catch more null/undefined errors at compile time.

### 17. **Mock Database Should Only Be for Testing**
**Severity:** LOW | **File:** `backend/src/lib/supabase.ts`  
**Current:** Good safeguard (refuses in production), but suggestion to add warning logging.

```typescript
if (env.USE_MOCK_DB) {
  console.warn('⚠️ Using in-memory mock database — data will be lost on restart');
}
```

---

## ✅ GOOD PRACTICES FOUND

The codebase demonstrates several security best practices:

1. **Reentrancy Guards** - LendingPool uses `@nonReentrant` modifier ✓
2. **Access Control** - Proper role-based access with OpenZeppelin AccessControl ✓
3. **Safe Token Transfers** - Uses SafeERC20 for token operations ✓
4. **Input Validation** - Zod schemas for all API inputs ✓
5. **Signature Replay Protection** - Nonce-based SIWE with domain binding ✓
6. **Environment Validation** - Fast-fail on missing environment variables ✓
7. **One-time Nonce Usage** - Nonces are deleted after verification ✓
8. **Health Factor Checks** - LendingPool prevents over-borrowing ✓
9. **Error Handling** - Centralized error handler with proper HTTP status codes ✓
10. **TypeScript** - Full type safety across the stack ✓

---

## 🚀 SUMMARY OF FIXES NEEDED (Priority Order)

| Priority | Issue | Impact | Est. Time |
|----------|-------|--------|-----------|
| 🔴 1 | Remove exposed private keys from git history | Total compromise | 30 min |
| 🔴 2 | Add CORS origin validation | CSRF/account hijacking | 15 min |
| 🔴 3 | Move JWT to httpOnly cookies | XSS token theft | 1 hour |
| 🔴 4 | Implement auth rate limiting | Brute force attacks | 20 min |
| 🟡 5 | Add contract address validation | Failed deployments | 15 min |
| 🟡 6 | Add transaction confirmation checks | Silent failures | 45 min |
| 🟡 7 | Implement signature replay logging | Replay attacks | 30 min |
| 🟡 8 | Add request body size limits | DoS attacks | 10 min |
| 🟠 9 | Add error details filtering | Information disclosure | 15 min |
| 🟢 10 | Extract decimal constants | Code maintainability | 15 min |

---

## 📋 Next Steps

1. **Immediate (Today):**
   - Revoke all exposed private keys
   - Redeploy all contracts
   - Apply CRITICAL fixes (#1-4)

2. **Short-term (This Week):**
   - Apply HIGH priority fixes (#5-8)
   - Run security audit on contract code
   - Implement monitoring/alerting

3. **Before Mainnet:**
   - Full external security audit
   - Penetration testing
   - Load testing
   - Disaster recovery procedures

---

**Report Generated:** 2026-09-14  
**Reviewer:** GitHub Copilot (Claude Haiku 4.5)
