import { useState, type ReactNode } from "react";
import { AUTH_CONNECTION, WALLET_CONNECTORS } from "@web3auth/modal";
import { useWeb3Auth, useWeb3AuthConnect, useWeb3AuthDisconnect, useWeb3AuthUser } from "@web3auth/modal/react";

import { shortAddress } from "../../lib/format";
import { Notice } from "../ui";

/*
 * MetaMask Embedded Wallets controls. This module imports the SDK, so it is only ever loaded in the
 * browser, through components/wallet/index.tsx.
 */

function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" width="20" height="20" aria-hidden="true" focusable="false">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

/**
 * Sign-in: "Continue with Google" goes straight to Google's sign-in, and creates the person's
 * wallet the first time, already connected. "Other ways" opens a window with email, a phone
 * number, or an existing wallet such as MetaMask.
 */
export function EmbeddedSignIn() {
  const { connect, connectTo, loading, isConnected, error } = useWeb3AuthConnect();
  if (isConnected) return null;
  return (
    <div className="stack" style={{ gap: 10 }}>
      <button
        className="btn btn-block google-btn"
        data-testid="sign-in-google"
        data-tour="connect-wallet"
        disabled={loading}
        onClick={() => void connectTo(WALLET_CONNECTORS.AUTH, { authConnection: AUTH_CONNECTION.GOOGLE })}
      >
        <GoogleMark />
        {loading ? "Opening Google…" : "Continue with Google"}
      </button>
      <button className="btn btn-block btn-secondary" data-testid="sign-in" disabled={loading} onClick={() => void connect()}>
        Other ways: email, phone or MetaMask
      </button>
      <p className="hint">
        No app to install and no password to remember. Your AgriBridge account, a wallet in your name, is created the first time
        you sign in, and it is ready straight away.
      </p>
      {error && (
        <p className="form-error" role="alert">
          {/^user closed|popup has been closed|cancel/i.test(error.message) ? "Sign-in was closed before it finished. Try again." : error.message}
        </p>
      )}
    </div>
  );
}

export function EmbeddedSignOut({ className }: { className?: string }) {
  const { disconnect, loading } = useWeb3AuthDisconnect();
  return (
    <button className={className} disabled={loading} onClick={() => void disconnect()} data-testid="sign-out">
      Sign out
    </button>
  );
}

/** The person's name or email from their sign-in, falling back to the wallet address. */
export function EmbeddedAccountName({ address }: { address?: string }) {
  const { userInfo } = useWeb3AuthUser();
  return <span title={address}>{userInfo?.name || userInfo?.email || shortAddress(address)}</span>;
}

/**
 * Moving the wallet to MetaMask: shows the private key of a Google, email or phone wallet, only after
 * the person ticks that they understand, and only until they hide it. The key lives in this
 * component's state alone; it is never logged, stored or sent anywhere. Any other wallet already
 * lives in a wallet app, so `otherWallet` explains that instead.
 */
export function EmbeddedExportKey({ otherWallet }: { otherWallet: ReactNode }) {
  const { connection } = useWeb3Auth();
  const [understood, setUnderstood] = useState(false);
  const [key, setKey] = useState<string>();
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string>();

  if (connection?.connectorName !== WALLET_CONNECTORS.AUTH) return <>{otherWallet}</>;

  async function reveal() {
    setError(undefined);
    if (!understood) return setError("Tick the box first, to confirm you understand.");
    try {
      const value = (await connection?.ethereumProvider?.request({ method: "eth_private_key" })) as string | undefined;
      if (!value) throw new Error("no key");
      setKey(value);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(
        /disabled/i.test(message)
          ? "Moving wallets out is switched off for AgriBridge. Ask the AgriBridge team to switch it on."
          : "Your key couldn't be shown. Sign out, sign in again, and try once more.",
      );
    }
  }

  async function copy() {
    if (!key) return;
    try {
      await navigator.clipboard.writeText(key);
      setCopied(true);
    } catch {
      setError("Copying didn't work. Select the key and copy it by hand.");
    }
  }

  function hide() {
    setKey(undefined);
    setCopied(false);
    setUnderstood(false);
  }

  return (
    <div className="stack" style={{ gap: 12 }}>
      <Notice tone="danger">
        <strong>Your private key controls everything in this wallet.</strong> Anyone who sees it can take your money and crop.
        AgriBridge will never ask for it. Show it only on a device you trust, with nobody watching.
      </Notice>
      <ol className="plain-steps">
        <li>In MetaMask, open the account menu and choose Add account, then Import account.</li>
        <li>Paste the key. The same wallet appears in MetaMask, with the same address and everything in it.</li>
        <li>Copy something else afterwards, so the key doesn&apos;t stay on your clipboard.</li>
      </ol>
      <p className="hint" style={{ margin: 0 }}>You can still sign in to AgriBridge with Google, email or phone as before.</p>
      {key ? (
        <div className="secret-box" data-testid="private-key">
          <code>{key}</code>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn btn-secondary btn-small" onClick={() => void copy()}>
              {copied ? "Copied" : "Copy key"}
            </button>
            <button className="btn btn-small" onClick={hide}>
              Hide key
            </button>
          </div>
        </div>
      ) : (
        <>
          <label className="row" style={{ fontSize: 14, gap: 8, minHeight: 40, cursor: "pointer" }}>
            <input type="checkbox" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} data-testid="export-understood" />
            <span>I understand that anyone with this key can take everything in this wallet.</span>
          </label>
          <button className="btn btn-secondary" onClick={() => void reveal()} data-testid="export-show">
            Show my private key
          </button>
        </>
      )}
      {error && (
        <p className="form-error" role="alert" style={{ margin: 0 }}>
          {error}
        </p>
      )}
    </div>
  );
}
