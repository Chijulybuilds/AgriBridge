import type { Page } from "@playwright/test";

/**
 * A deterministic test account. This is Anvil's well-known account #1, whose
 * private key is published in Foundry's documentation. It holds nothing on any
 * real network and is safe to commit.
 */
export const TEST_ACCOUNT = {
  address: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
  privateKey: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
} as const;

export const TEST_CHAIN_ID_HEX = "0x7a69"; // 31337, the Anvil / Foundry chain

/**
 * Injects an EIP-1193 provider into the page before any app code runs.
 *
 * Wagmi discovers wallets through EIP-6963 announcements and the legacy
 * `window.ethereum` object; this provides both, so RainbowKit lists it as a
 * normal injected wallet. Signing is delegated back to the Node context, where
 * viem holds the key, because the browser has no signing primitives of its own.
 */
export async function installMockWallet(page: Page) {
  // Signing happens in Node: the browser calls out through this binding.
  await page.exposeFunction("__signMessage", async (message: string) => {
    const { privateKeyToAccount } = await import("viem/accounts");
    const account = privateKeyToAccount(TEST_ACCOUNT.privateKey);
    return account.signMessage({ message });
  });

  await page.addInitScript(
    ({ address, chainIdHex }) => {
      type Handler = (args: unknown) => void;

      const listeners = new Map<string, Handler[]>();

      const provider = {
        isMetaMask: true,
        isMockWallet: true,

        async request({ method, params }: { method: string; params?: unknown[] }) {
          switch (method) {
            case "eth_requestAccounts":
            case "eth_accounts":
              return [address];

            case "eth_chainId":
              return chainIdHex;

            case "net_version":
              return String(parseInt(chainIdHex, 16));

            case "personal_sign": {
              // personal_sign passes [message, address]; the message arrives hex-encoded.
              const raw = (params?.[0] as string) ?? "";
              const text = raw.startsWith("0x")
                ? new TextDecoder().decode(
                    Uint8Array.from(
                      raw
                        .slice(2)
                        .match(/.{1,2}/g)
                        ?.map((b) => parseInt(b, 16)) ?? [],
                    ),
                  )
                : raw;
              return (window as never as { __signMessage: (m: string) => Promise<string> }).__signMessage(
                text,
              );
            }

            case "wallet_switchEthereumChain":
              return null;

            case "eth_estimateGas":
              return "0x5208";

            default:
              // Reads the app makes through the wallet are not part of what the
              // e2e suite asserts; contract state is covered by the Foundry suite.
              return null;
          }
        },

        on(event: string, handler: Handler) {
          listeners.set(event, [...(listeners.get(event) ?? []), handler]);
        },
        removeListener(event: string, handler: Handler) {
          listeners.set(event, (listeners.get(event) ?? []).filter((h) => h !== handler));
        },
      };

      Object.defineProperty(window, "ethereum", {
        value: provider,
        writable: true,
        configurable: true,
      });

      // EIP-6963: announce the provider so Wagmi's connector discovery finds it.
      const info = {
        uuid: "00000000-0000-4000-8000-000000000001",
        name: "Mock Wallet",
        icon: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4=",
        rdns: "io.agribridge.mockwallet",
      };

      const announce = () =>
        window.dispatchEvent(
          new CustomEvent("eip6963:announceProvider", {
            detail: Object.freeze({ info, provider }),
          }),
        );

      window.addEventListener("eip6963:requestProvider", announce);
      announce();
    },
    { address: TEST_ACCOUNT.address, chainIdHex: TEST_CHAIN_ID_HEX },
  );
}

/**
 * Connects the mock wallet through the RainbowKit modal and completes
 * Sign-In with Ethereum, leaving the page on the signed-in dashboard.
 */
export async function connectAndSignIn(page: Page, role: "farmer" | "investor" = "farmer") {
  await page.goto(`/login?role=${role}`);

  await page.getByRole("button", { name: /connect wallet/i }).first().click();
  await page.getByText("Mock Wallet").first().click();

  // The SIWE button only enables once the connection is established.
  const signIn = page.getByTestId("siwe-sign-in");
  await signIn.waitFor({ state: "visible" });
  await signIn.click();
}
