import { expect, type Page } from "@playwright/test";

/**
 * Test accounts: Anvil's well-known default accounts, whose keys are published in
 * Foundry's documentation. They hold nothing on any real network. Anvil keeps them
 * unlocked, so the mock wallet below can send their transactions without keys.
 */
export const ACCOUNTS = {
  farmer: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
  investor: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
  buyer: "0x90F79bf6EB2c4f870365E785982E1f101E93b906",
  /** Stands in for the verifier Safe on the local chain (VERIFIER_ADDRESS in the local deploy). */
  verifier: "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65",
  regulator: "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc",
} as const;

export type AccountName = keyof typeof ACCOUNTS;

export const RPC_URL = "http://127.0.0.1:8545";
export const TEST_CHAIN_ID_HEX = "0x7a69"; // 31337, the Anvil / Foundry chain

/** Sends a JSON-RPC request to the local chain from Node. */
export async function rpc(method: string, params: unknown[] = []): Promise<unknown> {
  const response = await fetch(RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const json = (await response.json()) as { result?: unknown; error?: { message: string } };
  if (json.error) throw new Error(json.error.message);
  return json.result;
}

/**
 * Injects an EIP-1193 wallet for `account` into the page before any app code runs.
 *
 * It announces itself the way browser wallets do (EIP-6963 and window.ethereum),
 * answers for its one account, and passes every other request, transactions
 * included, to the local Anvil chain, which signs for its unlocked accounts. So
 * the app is driven end to end with real transactions and no private keys.
 */
export async function installMockWallet(page: Page, account: AccountName = "farmer") {
  await page.exposeFunction("__anvilRpc", (method: string, params: unknown[]) => rpc(method, params));

  await page.addInitScript(
    ({ address, chainIdHex }) => {
      type Handler = (args: unknown) => void;
      const listeners = new Map<string, Handler[]>();
      const forward = (window as never as { __anvilRpc: (m: string, p: unknown[]) => Promise<unknown> }).__anvilRpc;

      // Like MetaMask: no accounts until the site is approved, and the approval is remembered per site.
      const APPROVED = "mockwallet:approved";
      const approved = () => {
        try {
          return window.localStorage.getItem(APPROVED) === "1";
        } catch {
          return false;
        }
      };

      const provider = {
        isMetaMask: true,
        isMockWallet: true,

        async request({ method, params }: { method: string; params?: unknown[] }) {
          switch (method) {
            case "eth_requestAccounts":
              window.localStorage.setItem(APPROVED, "1");
              return [address];
            case "eth_accounts":
              return approved() ? [address] : [];
            case "eth_chainId":
              return chainIdHex;
            case "net_version":
              return String(parseInt(chainIdHex, 16));
            case "wallet_switchEthereumChain":
            case "wallet_addEthereumChain":
              return null;
            case "wallet_requestPermissions":
            case "wallet_getPermissions":
              return [{ parentCapability: "eth_accounts" }];
            case "eth_sendTransaction": {
              const [tx] = (params ?? []) as Array<Record<string, unknown>>;
              return forward("eth_sendTransaction", [{ ...tx, from: address }]);
            }
            default:
              return forward(method, params ?? []);
          }
        },

        on(event: string, handler: Handler) {
          listeners.set(event, [...(listeners.get(event) ?? []), handler]);
        },
        removeListener(event: string, handler: Handler) {
          listeners.set(event, (listeners.get(event) ?? []).filter((h) => h !== handler));
        },
      };

      Object.defineProperty(window, "ethereum", { value: provider, writable: true, configurable: true });

      // EIP-6963: announce the provider so wagmi's connector discovery finds it.
      const info = {
        uuid: "00000000-0000-4000-8000-000000000001",
        name: "Mock Wallet",
        icon: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4=",
        rdns: "io.agribridge.mockwallet",
      };
      const announce = () =>
        window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail: Object.freeze({ info, provider }) }));
      window.addEventListener("eip6963:requestProvider", announce);
      announce();
    },
    { address: ACCOUNTS[account], chainIdHex: TEST_CHAIN_ID_HEX },
  );
}

/** Signs in with the mock wallet as `role`, leaving the page on that role's home. */
export async function signIn(page: Page, role: "farmer" | "investor" | "buyer" = "farmer") {
  await page.goto(`/login?role=${role}`);
  await page.getByTestId("connect-wallet").first().click();
  const home = role === "farmer" ? /\/farmer$/ : role === "investor" ? /\/investor$/ : /\/market$/;
  await page.waitForURL(home);
}

/** Waits until the transaction status on the page (or inside `scope`) reads "confirmed". */
export async function expectConfirmed(scope: Page | ReturnType<Page["locator"]>, timeout = 45_000) {
  await expect(scope.getByTestId("tx-status").last()).toHaveAttribute("data-status", "confirmed", { timeout });
}
