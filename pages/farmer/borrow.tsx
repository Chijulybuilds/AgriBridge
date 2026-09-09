import DashboardLayout from '../../components/layout/DashboardLayout'
import withAuth from '../../components/withAuth'
import { useEffect, useState } from 'react'
import { getMyCommodities } from '../../lib/api'
import { BanknotesIcon, InformationCircleIcon } from '@heroicons/react/24/outline'

function BorrowFunds() {
  const [commodities, setCommodities] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState("")
  const [borrowAmount, setBorrowAmount] = useState<number | "">("")
  const [duration, setDuration] = useState("90")
  const [submitLoading, setSubmitLoading] = useState(false)
  const [success, setSuccess] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    getMyCommodities()
      .then((data) => {
        if (mounted) setCommodities(Array.isArray(data) ? data : [])
      })
      .catch((err) => console.error("Failed to load commodities for borrow:", err))
      .finally(() => {
        if (mounted) setLoading(false)
      })
    return () => {
      mounted = false
    }
  }, [])

  // Only commodities that are verified (tokenized) can be used as collateral
  const tokenizedCommodities = commodities.filter(
    (c) => c.status === "Verified" || c.status === "tokenized"
  )

  const selectedCommodity = tokenizedCommodities.find((c) => c.id === selectedId)

  // Calculate dynamic collateral values
  let collateralValue = 0
  if (selectedCommodity) {
    const qty = selectedCommodity.quantity_kg !== undefined ? selectedCommodity.quantity_kg : (selectedCommodity.quantity || 0)
    let pricePerKg = 2.5
    const type = (selectedCommodity.commodity_type || selectedCommodity.type || selectedCommodity.name || "").toLowerCase()
    if (type.includes("maize")) pricePerKg = 0.8
    else if (type.includes("rice")) pricePerKg = 1.2
    
    collateralValue = selectedCommodity.tokenValue !== undefined ? selectedCommodity.tokenValue : qty * pricePerKg
  }

  const maxBorrowable = collateralValue * 0.75
  const interestRate = 4.5 // 4.5% APR

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedCommodity) return
    setError(null)
    setSuccess(null)

    if (Number(borrowAmount) > maxBorrowable) {
      setError("Borrow amount exceeds maximum borrowable limit (75% of collateral value).")
      return
    }

    setSubmitLoading(true)
    try {
      // Simulate loan initiation on-chain / database updates
      await new Promise((resolve) => setTimeout(resolve, 1500))
      setSuccess(`USDC Loan of $${Number(borrowAmount).toLocaleString()} successfully approved against Collateral Token CROP-${selectedCommodity.token_id || "101"}!`)
      setSelectedId("")
      setBorrowAmount("")
    } catch (err: any) {
      setError(err.message || "Failed to request loan.")
    } finally {
      setSubmitLoading(false)
    }
  }

  return (
    <DashboardLayout userType="farmer">
      {/* HEADER */}
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.3px', marginBottom: '4px' }}>
          Borrow Funds
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
          Use your tokenized commodities as collateral to access instant USDC loans.
        </p>
      </div>

      <div className="two-col" style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '24px' }}>
        {/* FORM */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px', padding: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '24px' }}>
            <div style={{
              width: '32px', height: '32px', borderRadius: '6px',
              background: 'var(--accent-green-bg)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <BanknotesIcon style={{ width: '16px', height: '16px', color: 'var(--accent-green)' }} />
            </div>
            <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
              Loan Request
            </span>
          </div>

          {error && (
            <div style={{ color: "#c0392b", background: "#fdecea", padding: "10px", borderRadius: "6px", fontSize: "13px", marginBottom: "16px" }}>
              {error}
            </div>
          )}
          {success && (
            <div style={{ color: "var(--accent-green)", background: "var(--accent-green-bg)", padding: "10px", borderRadius: "6px", fontSize: "13px", marginBottom: "16px" }}>
              {success}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            {/* Select collateral */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                Select Collateral Token
              </label>
              {loading ? (
                <p style={{ fontSize: "13px", color: "var(--text-secondary)" }}>Loading verified tokens...</p>
              ) : tokenizedCommodities.length === 0 ? (
                <div style={{ padding: "12px", border: "1px solid var(--border)", borderRadius: "6px", background: "var(--bg-secondary)" }}>
                  <p style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
                    No verified commodity tokens available. You must tokenize your assets and have them verified first.
                  </p>
                </div>
              ) : (
                <select
                  value={selectedId}
                  onChange={(e) => setSelectedId(e.target.value)}
                  required
                  style={{
                    width: '100%', padding: '9px 12px', borderRadius: '6px',
                    border: '1px solid var(--border-light)', background: 'var(--bg-secondary)',
                    fontSize: '13px', color: 'var(--text-primary)', outline: 'none',
                  }}
                >
                  <option value="">Choose a tokenized commodity</option>
                  {tokenizedCommodities.map(c => {
                    const type = c.commodity_type || c.type || c.name || "Unknown"
                    const tokenSymbol = c.token_id !== null && c.token_id !== undefined ? `CROP-${c.token_id}` : (c.tokenSymbol || "CROP-Token")
                    return (
                      <option key={c.id} value={c.id}>
                        {tokenSymbol} — {type}
                      </option>
                    )
                  })}
                </select>
              )}
            </div>

            {/* Collateral preview */}
            {selectedCommodity && (
              <div style={{
                padding: '14px', borderRadius: '6px', marginBottom: '16px',
                background: 'var(--bg-secondary)', border: '1px solid var(--border)',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Collateral Value</span>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                    ${collateralValue.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Max Borrowable (75%)</span>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--accent-green)' }}>
                    ${maxBorrowable.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Interest Rate</span>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{interestRate}% APR</span>
                </div>
              </div>
            )}

            {/* Borrow amount */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                Borrow Amount (USDC)
              </label>
              <input
                type="number"
                value={borrowAmount}
                onChange={(e) => setBorrowAmount(e.target.value === "" ? "" : Number(e.target.value))}
                placeholder="e.g. 5000"
                required
                disabled={!selectedId}
                style={{
                  width: '100%', padding: '9px 12px', borderRadius: '6px',
                  border: '1px solid var(--border-light)', background: 'var(--bg-secondary)',
                  fontSize: '13px', color: 'var(--text-primary)', outline: 'none',
                }}
              />
            </div>

            {/* Loan duration */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                Loan Duration
              </label>
              <select
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                disabled={!selectedId}
                style={{
                  width: '100%', padding: '9px 12px', borderRadius: '6px',
                  border: '1px solid var(--border-light)', background: 'var(--bg-secondary)',
                  fontSize: '13px', color: 'var(--text-primary)', outline: 'none',
                }}
              >
                <option value="30">30 Days</option>
                <option value="90">90 Days</option>
                <option value="180">180 Days</option>
              </select>
            </div>

            <button
              disabled={submitLoading || !selectedId}
              type="submit"
              style={{
                width: '100%', padding: '11px', borderRadius: '7px',
                background: 'var(--accent-green)', border: 'none',
                color: '#fff', fontSize: '14px', fontWeight: 600,
                cursor: (submitLoading || !selectedId) ? 'not-allowed' : 'pointer',
                opacity: (submitLoading || !selectedId) ? 0.7 : 1,
                marginTop: '8px',
                transition: "all 0.2s ease",
              }}
            >
              {submitLoading ? "Requesting..." : "Borrow USDC →"}
            </button>
          </form>
        </div>

        {/* RIGHT SIDE */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Info card */}
          <div style={{ background: 'var(--accent-green-bg)', border: '1px solid #c8e6c8', borderRadius: '8px', padding: '20px' }}>
            <div style={{ display: 'flex', gap: '10px' }}>
              <InformationCircleIcon style={{ width: '18px', height: '18px', color: 'var(--accent-green)', flexShrink: 0, marginTop: '2px' }} />
              <div>
                <div style={{ fontSize: '12px', fontWeight: 600, color: '#1b5e20', marginBottom: '4px' }}>
                  LTV & Collateral Requirements
                </div>
                <div style={{ fontSize: '11px', color: '#2e7d32', lineHeight: '1.4' }}>
                  AgriBridge allows borrowing up to 75% LTV (Loan-to-Value) against verified commodity tokens. Loan liquidations may occur if on-chain price feeds report that your collateral health drops below 110%.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}

export default withAuth(BorrowFunds, "farmer")