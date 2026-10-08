import Head from "next/head";
import Link from "next/link";

import { LogoMark } from "./Logo";

/**
 * The site's "page not found". The hidden verifier page shows exactly this to
 * anyone but the Safe, so it can't be told apart from a page that doesn't exist.
 */
export function NotFound() {
  return (
    <>
      <Head>
        <title>Page not found · AgriBridge</title>
      </Head>
      <div
        className="field-rows"
        style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "var(--bg-primary)", padding: 24 }}
        data-testid="not-found"
      >
        <div style={{ textAlign: "center", maxWidth: 420 }}>
          <LogoMark size={44} />
          <div className="display" style={{ fontSize: 64, lineHeight: 1, margin: "18px 0 8px", color: "var(--accent-green)" }}>
            404
          </div>
          <h1 style={{ fontSize: 22, marginBottom: 8 }}>This page could not be found.</h1>
          <p className="text-secondary" style={{ marginBottom: 22 }}>
            It may have moved, or the address may be mistyped.
          </p>
          <Link className="btn" href="/">
            Back to AgriBridge
          </Link>
        </div>
      </div>
    </>
  );
}
