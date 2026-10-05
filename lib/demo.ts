/**
 * Demo accounts: built-in wallets for showing the app with play money.
 *
 * When NEXT_PUBLIC_DEMO_*_KEY variables are set (`npm run demo` sets them for the
 * local chain; see DEMO.md for Sepolia), the app offers one-click Demo Verifier,
 * Demo Farmer and Demo Investor accounts. Each signs in-browser with its key, so
 * no MetaMask or WalletConnect is needed.
 *
 * These keys are public by design. Use them only with throwaway test accounts on
 * a local chain or a testnet, never with anything that holds real value.
 */
import { createConnector, injected } from "wagmi";
import {
  createPublicClient,
  createWalletClient,
  hexToBigInt,
  http,
  toHex,
  type Chain,
  type EIP1193Provider,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { Wallet, WalletList } from "@rainbow-me/rainbowkit";

export type DemoRole = "verifier" | "farmer" | "investor";

export type DemoAccount = {
  role: DemoRole;
  label: string;
  address: Hex;
  privateKey: Hex;
};

const LABELS: Record<DemoRole, string> = {
  verifier: "Demo Verifier",
  farmer: "Demo Farmer",
  investor: "Demo Investor",
};

/** Listed literally so Next.js inlines them into the client bundle. */
const KEYS: Record<DemoRole, string | undefined> = {
  verifier: process.env.NEXT_PUBLIC_DEMO_VERIFIER_KEY,
  farmer: process.env.NEXT_PUBLIC_DEMO_FARMER_KEY,
  investor: process.env.NEXT_PUBLIC_DEMO_INVESTOR_KEY,
};

export const demoAccounts: DemoAccount[] = (Object.keys(KEYS) as DemoRole[]).flatMap((role) => {
  const key = KEYS[role];
  if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) return [];
  const privateKey = key as Hex;
  return [{ role, label: LABELS[role], address: privateKeyToAccount(privateKey).address, privateKey }];
});

export const demoMode = demoAccounts.length > 0;

export function demoConnectorId(role: DemoRole): string {
  return `demo-${role}`;
}

/**
 * A minimal EIP-1193 provider backed by a local key: it answers account and chain
 * queries itself, signs messages and transactions in the browser, and sends
 * everything else to the RPC.
 */
export function createDemoProvider(privateKey: Hex, chain: Chain, rpcUrl?: string): EIP1193Provider {
  const account = privateKeyToAccount(privateKey);
  const transport = http(rpcUrl);
  const publicClient = createPublicClient({ chain, transport });
  const walletClient = createWalletClient({ account, chain, transport });
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>();

  // Like a real wallet, only expose the account once the user has picked it. Otherwise
  // wagmi would auto-connect every demo account on page load.
  const authorizedKey = `agribridge.demo.${account.address}.connected`;
  const isAuthorized = () => {
    try {
      return window.localStorage.getItem(authorizedKey) === "1";
    } catch {
      return false;
    }
  };
  const setAuthorized = (value: boolean) => {
    try {
      if (value) window.localStorage.setItem(authorizedKey, "1");
      else window.localStorage.removeItem(authorizedKey);
    } catch {
      // Storage unavailable: the account just will not reconnect on reload.
    }
  };

  const request = async ({ method, params }: { method: string; params?: unknown }) => {
    const args = (params ?? []) as unknown[];
    switch (method) {
      case "eth_accounts":
        return isAuthorized() ? [account.address] : [];
      case "eth_requestAccounts":
        setAuthorized(true);
        return [account.address];
      case "eth_chainId":
        return toHex(chain.id);
      case "net_version":
        return String(chain.id);
      case "wallet_requestPermissions":
        setAuthorized(true);
        return [{ parentCapability: "eth_accounts" }];
      case "wallet_getPermissions":
        return isAuthorized() ? [{ parentCapability: "eth_accounts" }] : [];
      case "wallet_revokePermissions":
        setAuthorized(false);
        return null;
      case "wallet_switchEthereumChain": {
        const target = (args[0] as { chainId: Hex }).chainId;
        if (Number(target) === chain.id) return null;
        throw Object.assign(new Error(`Demo accounts only work on ${chain.name}.`), { code: 4902 });
      }
      case "personal_sign":
        return account.signMessage({ message: { raw: args[0] as Hex } });
      case "eth_sendTransaction": {
        const tx = args[0] as { to?: Hex; data?: Hex; value?: Hex; gas?: Hex };
        return walletClient.sendTransaction({
          to: tx.to,
          data: tx.data,
          value: tx.value ? hexToBigInt(tx.value) : undefined,
          gas: tx.gas ? hexToBigInt(tx.gas) : undefined,
        });
      }
      default:
        return publicClient.request({ method, params } as never);
    }
  };

  return {
    request,
    on(event: string, listener: (...args: unknown[]) => void) {
      listeners.set(event, (listeners.get(event) ?? new Set()).add(listener));
    },
    removeListener(event: string, listener: (...args: unknown[]) => void) {
      listeners.get(event)?.delete(listener);
    },
  } as unknown as EIP1193Provider;
}

/** A small coloured badge with the role's initial, used as the wallet icon. */
function demoIcon(role: DemoRole): string {
  const colours: Record<DemoRole, string> = { verifier: "#1971c2", farmer: "#2f9e44", investor: "#e8a317" };
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" rx="14" fill="${colours[role]}"/>` +
    `<text x="32" y="43" font-family="Arial" font-size="30" font-weight="700" fill="#fff" text-anchor="middle">${role[0].toUpperCase()}</text></svg>`;
  return `data:image/svg+xml;base64,${typeof btoa === "function" ? btoa(svg) : Buffer.from(svg).toString("base64")}`;
}

/** The demo accounts as a RainbowKit wallet group, so they also appear in the Connect Wallet modal. */
export function demoWalletGroup(chain: Chain, rpcUrl?: string): WalletList {
  if (!demoMode) return [];

  const wallets = demoAccounts.map((demo) => (): Wallet => {
    const provider = createDemoProvider(demo.privateKey, chain, rpcUrl);
    const icon = demoIcon(demo.role);
    return {
      id: demoConnectorId(demo.role),
      name: demo.label,
      iconUrl: icon,
      iconBackground: "#ffffff",
      installed: true,
      createConnector: (walletDetails) =>
        createConnector((config) => ({
          ...injected({
            target: { id: demoConnectorId(demo.role), name: demo.label, icon, provider: () => provider },
          })(config),
          ...walletDetails,
        })),
    };
  });

  return [{ groupName: "Demo accounts (play money)", wallets }];
}
