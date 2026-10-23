import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useConnection } from "wagmi";
import { formatEther, getAddress, isAddress, zeroAddress, type Address } from "viem";
import qrcode from "qrcode-generator";

import AppLayout from "../components/layout/AppLayout";
import { TxStatus } from "../components/TxStatus";
import { Card, KeyValue, Money, Notice, PageHeader, Segmented } from "../components/ui";
import { ExportKey } from "../components/wallet";
import { lotValue, useCommodities, useEthBalance, useInvestorPosition, useLots, useUsdc } from "../hooks/useProtocolData";
import { useTx } from "../hooks/useTx";
import { ERC20Abi } from "../lib/contracts/abis";
import { contracts } from "../lib/contracts/config";
import { addressGroups, eth, kg, money, nairaInput, ngn, parseEth, parseNairaUpTo, shortAddress, usd } from "../lib/format";
import { useRememberedRole } from "../lib/session";
import { activeChain } from "../lib/wagmi";

/**
 * Your wallet: the address to receive money at (with a QR code), everything the wallet holds, and
 * sending dollars or ETH to any address. A Google, email or phone wallet can also be moved into
 * MetaMask, to use the same wallet in other apps.
 */
export default function WalletPage() {
  const role = useRememberedRole("farmer");
  const { address } = useConnection();
  const { balance: usdc } = useUsdc(address);
  const { balance: ethBalance } = useEthBalance(address);

  return (
    <AppLayout role={role} title="Your wallet">
      <PageHeader
        section="wallet"
        eyebrow="Your account"
        title="Your wallet"
        subtitle="Receive money, see everything you hold, and send money to anyone. Your wallet is yours: AgriBridge never holds its key."
      />
      {address && (
        <>
          <div className="grid-2">
            <Receive address={address} />
            <Holdings address={address} usdc={usdc} ethBalance={ethBalance} />
          </div>
          <div className="grid-2">
            <SendMoney address={address} usdc={usdc} ethBalance={ethBalance} />
            <Card title="Use this wallet in other apps" help="export-key" tour="wallet-export" testId="wallet-export">
              <p className="text-secondary" style={{ marginTop: 0 }}>
                To buy, sell or send money in other apps, the wallet needs to be in a wallet app such as MetaMask. Anyone can already
                send you money at your address.
              </p>
              <details className="wallet-advanced">
                <summary data-testid="export-open">Move this wallet to MetaMask (advanced)</summary>
                <div style={{ marginTop: 14 }}>
                  <ExportKey />
                </div>
              </details>
            </Card>
          </div>
        </>
      )}
    </AppLayout>
  );
}

/** The address, in readable groups and as a QR code, with a copy button. */
function Receive({ address }: { address: Address }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Card title="Receive money" help="wallet-address" tour="wallet-receive">
      <div className="wallet-receive">
        <AddressQr address={address} />
        <div className="stack" style={{ gap: 10, flex: 1, minWidth: 200 }}>
          <span className="field-label">Your wallet address</span>
          <p className="address-box" style={{ margin: 0 }} data-testid="wallet-address">
            {addressGroups(address)}
          </p>
          <div className="row">
            <button className="btn btn-secondary btn-small" onClick={() => void copy()} data-testid="copy-address">
              {copied ? "Copied" : "Copy address"}
            </button>
          </div>
          <p className="hint" style={{ margin: 0 }}>
            Anyone can send you dollars (USDC), ETH or crop here, from any wallet or app. For now, use it only on the {activeChain.name}{" "}
            test network.
          </p>
        </div>
      </div>
    </Card>
  );
}

/** The address as a QR code: dark on white with a clear margin, so any phone camera or wallet app can scan it. */
function AddressQr({ address }: { address: string }) {
  const code = useMemo(() => {
    const qr = qrcode(0, "M");
    qr.addData(address);
    qr.make();
    const count = qr.getModuleCount();
    let path = "";
    for (let row = 0; row < count; row++) {
      for (let col = 0; col < count; col++) {
        if (qr.isDark(row, col)) path += `M${col + 4},${row + 4}h1v1h-1z`;
      }
    }
    return { path, size: count + 8 };
  }, [address]);

  return (
    <div className="wallet-qr" data-testid="wallet-qr">
      <svg viewBox={`0 0 ${code.size} ${code.size}`} role="img" aria-label="QR code of your wallet address" shapeRendering="crispEdges">
        <path d={code.path} fill="#000" />
      </svg>
    </div>
  );
}

/** Everything the wallet holds: dollars, the ETH that pays fees, crop, and any investment in the pool. */
function Holdings({ address, usdc, ethBalance }: { address: Address; usdc: bigint | undefined; ethBalance: bigint | undefined }) {
  const { lots } = useLots(address);
  const { byId: commodities } = useCommodities();
  const { position } = useInvestorPosition(address);

  const held = lots.filter((lot) => lot.balanceKg > 0n);
  const cropKg = held.reduce((sum, lot) => sum + lot.balanceKg, 0n);
  const cropValue = held.reduce((sum, lot) => sum + (lotValue(lot, commodities.get(lot.commodityId), lot.balanceKg) ?? 0n), 0n);

  return (
    <Card title="What you hold" tour="wallet-holdings" testId="wallet-holdings">
      <KeyValue label="Dollars (USDC)" help="dollar-balance" value={<Money value={usdc} />} testId="hold-usdc" />
      <KeyValue label="ETH for network fees" help="network-fee" value={eth(ethBalance)} testId="hold-eth" />
      <KeyValue
        label="Crop you hold"
        help="stock"
        value={
          cropKg > 0n ? (
            <>
              {kg(cropKg)} · <Money value={cropValue} />
            </>
          ) : (
            "None yet"
          )
        }
      />
      <KeyValue label="Invested in the pool" help="shares" value={position && position.shares > 0n ? <Money value={position.value} /> : "Nothing yet"} />
      {ethBalance === 0n && (
        <Notice tone="warn">
          You have no ETH yet, so you can&apos;t pay network fees. Ask the AgriBridge team to send a little to your address.
        </Notice>
      )}
    </Card>
  );
}

type Asset = "usdc" | "eth";

/** True for AgriBridge's own contracts: money sent to them directly, rather than through the app, is lost. */
function isAgriBridgeContract(target: Address): boolean {
  return Object.values(contracts).some((value) => typeof value === "string" && value.toLowerCase() === target.toLowerCase());
}

/**
 * Sending dollars or ETH to any address, in two steps: fill in the form, then check the amount and
 * the whole address once more before confirming. Addresses that would lose the money are refused.
 */
function SendMoney({ address, usdc, ethBalance }: { address: Address; usdc: bigint | undefined; ethBalance: bigint | undefined }) {
  const tx = useTx();
  const [asset, setAsset] = useState<Asset>("usdc");
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [review, setReview] = useState<{ to: Address; value: bigint; asset: Asset }>();
  const [formError, setFormError] = useState<string | null>(null);
  const [sent, setSent] = useState<string>();
  const reviewRef = useRef<HTMLDivElement>(null);
  const toRef = useRef<HTMLInputElement>(null);

  // The form and the check panel take turns, so focus moves with them rather than falling to the page.
  useEffect(() => {
    if (review) reviewRef.current?.focus();
  }, [review]);

  /** Back to the form, filled in with the payment being checked, so nothing has to be typed again. */
  function change() {
    if (review) {
      setAsset(review.asset);
      setTo(review.to);
      setAmount(review.asset === "usdc" ? nairaInput(review.value) : formatEther(review.value));
    }
    setReview(undefined);
    requestAnimationFrame(() => toRef.current?.focus());
  }

  const value = asset === "usdc" ? parseNairaUpTo(amount, usdc) : parseEth(amount);
  const shown = (what: Asset, v: bigint | undefined) => (what === "usdc" ? money(v) : eth(v));

  function check(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    const typed = to.trim();
    if (!isAddress(typed, { strict: false })) return setFormError('Enter a wallet address: "0x" followed by 40 letters and numbers.');
    const recipient = getAddress(typed);
    if (recipient === zeroAddress) return setFormError("That address belongs to nobody, so money sent there is lost. Check the address.");
    if (recipient === address) return setFormError("That is this wallet's own address. Enter the address you want to send to.");
    if (isAgriBridgeContract(recipient)) {
      return setFormError(
        "That is an AgriBridge contract, not a person's wallet, and money sent to it directly is lost. To invest, repay or buy, use those pages.",
      );
    }
    if (!value) return setFormError("Enter an amount above zero.");
    if (asset === "usdc") {
      if (usdc === undefined || value > usdc) return setFormError(`You have ${money(usdc)}. Enter that or less.`);
      if (ethBalance === 0n) {
        return setFormError("You need a little ETH to pay the network fee. Ask the AgriBridge team to send some to your address.");
      }
    } else if (ethBalance === undefined || value >= ethBalance) {
      return setFormError(`You have ${eth(ethBalance)}, and the network fee comes out of it too. Send a little less.`);
    }
    tx.reset();
    setReview({ to: recipient, value, asset });
  }

  async function confirm() {
    if (!review) return;
    const payment = review;
    // Set before sending, so the confirmation never shows an earlier payment's message, and the
    // form starts empty for the next payment as soon as this one is on its way.
    setSent(`Sent ${shown(payment.asset, payment.value)} to ${shortAddress(payment.to)}.`);
    setTo("");
    setAmount("");
    try {
      if (payment.asset === "usdc") {
        await tx.send(
          { address: contracts.usdc!, abi: ERC20Abi, functionName: "transfer", args: [payment.to, payment.value] },
          "Send dollars",
        );
      } else {
        await tx.sendEth(payment.to, payment.value, "Send ETH");
      }
    } catch {
      return; // Shown by TxStatus; "Change" brings the details back.
    }
    // A payment started while the balances refreshed is left alone.
    setReview((current) => (current === payment ? undefined : current));
  }

  // Once confirmed, the check panel goes at once (the balances may still be refreshing), so the
  // same payment can't be sent twice.
  const checking = review !== undefined && tx.state !== "confirmed";

  return (
    <Card title="Send money" help="send-money" tour="wallet-send" testId="wallet-send">
      {checking && review ? (
        <div className="stack" style={{ gap: 12, outline: "none" }} ref={reviewRef} tabIndex={-1} aria-label="Check the payment" data-testid="send-review">
          <KeyValue label="You send" value={review.asset === "usdc" ? <Money value={review.value} /> : eth(review.value)} />
          <div>
            <span className="field-label">To this address</span>
            <p className="address-box" style={{ margin: "4px 0 0" }} data-testid="send-review-to">
              {addressGroups(review.to)}
            </p>
          </div>
          <Notice tone="warn">Check the address once more. Money sent to a wrong address can&apos;t be brought back.</Notice>
          <div className="row">
            <button className="btn" onClick={() => void confirm()} disabled={tx.isBusy} data-testid="send-confirm">
              {tx.isBusy ? "Working…" : `Send ${review.asset === "usdc" ? ngn(review.value) : eth(review.value)}`}
            </button>
            <button className="btn btn-secondary" onClick={change} disabled={tx.isBusy}>
              Change
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={check} noValidate>
          <div className="field">
            <span className="field-label" id="send-what">
              What to send
            </span>
            <Segmented
              options={[
                { id: "usdc", label: "Dollars (USDC)" },
                { id: "eth", label: "ETH for fees" },
              ]}
              value={asset}
              onChange={(next) => {
                setAsset(next as Asset);
                setAmount("");
                setFormError(null);
              }}
              testIdPrefix="send-asset"
              labelledBy="send-what"
            />
          </div>
          <div className="field">
            <label htmlFor="send-to">To this wallet address</label>
            <input
              id="send-to"
              ref={toRef}
              className="input address-input"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="0x…"
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              data-testid="send-to"
            />
          </div>
          <div className="field">
            <label htmlFor="send-amount">{asset === "usdc" ? "Amount (₦)" : "Amount (ETH)"}</label>
            <div className="row" style={{ flexWrap: "nowrap" }}>
              <input
                id="send-amount"
                className="input"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                data-testid="send-amount"
              />
              {asset === "usdc" && (
                <button type="button" className="btn btn-secondary" disabled={!usdc} onClick={() => usdc && setAmount(nairaInput(usdc))}>
                  Max
                </button>
              )}
            </div>
            <span className="hint" data-testid="send-amount-hint">
              {asset === "usdc"
                ? `${value ? `That is ${usd(value)}. ` : ""}You have ${money(usdc)}.`
                : `You have ${eth(ethBalance)}. Keep a little back for network fees.`}
            </span>
          </div>
          {formError && (
            <p className="form-error" role="alert" data-testid="form-error">
              {formError}
            </p>
          )}
          <button className="btn btn-block" type="submit" data-testid="send-check">
            Check the payment
          </button>
        </form>
      )}
      <TxStatus tx={tx} success={sent} />
    </Card>
  );
}
