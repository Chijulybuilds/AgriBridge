import DashboardLayout from '../../components/layout/DashboardLayout'
import { commodities } from '../../lib/mockData'
import { BanknotesIcon, InformationCircleIcon } from '@heroicons/react/24/outline'

export default function BorrowFunds() {
  const tokenizedCommodities = commodities.filter(c => c.status === 'tokenized')

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

          {/* Select collateral */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
              Select Collateral Token
            </label>
            <select style={{
              width: '100%', padding: '9px 12px', borderRadius: '6px',
              border: '1px solid var(--border-light)', background: 'var(--bg-secondary)',
              fontSize: '13px', color: 'var(--text-primary)', outline: 'none',
            }}>
              <option value="">Choose a tokenized commodity</option>
              {tokenizedCommodities.map(c => (
                <option key={c.id} value={c.id}>
                  {c.tokenSymbol} — {c.name} (${c.tokenValue.toLocaleString()})
                </option>
              ))}
            </select>
          </div>

          {/* Collateral preview */}
          <div style={{
            padding: '14px', borderRadius: '6px', marginBottom: '16px',
            background: 'var(--bg-secondary)', border: '1px solid var(--border)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Collateral Value</span>
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>$12,500</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Max Borrowable (75%)</span>
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--accent-green)' }}>$9,375</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Interest Rate</span>
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>4.5% APR</span>
            </div>
          </div>

          {/* Borrow amount */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
              Borrow Amount (USDC)
            </label>
            <input
              type="number"
              placeholder="e.g. 5000"
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
            <select style={{
              width: '100%', padding: '9px 12px', borderRadius: '6px',
              border: '1px solid var(--border-light)', background: 'var(--bg-secondary)',
              fontSize: '13px', color: 'var(--text-primary)', outline: 'none',
            }}>
              <option>30 days</option>
              <option>60 days</option>
              <option>90 days</option>
              <option>180 days</option>
            </select>
          </div>

          {/* Loan summary */}
          <div style={{
            padding: '14px', borderRadius: '6px', marginBottom: '20px',
            background: 'var(--accent-green-bg)', border: '1px solid #c8e6c8',
          }}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--accent-green)', marginBottom: '10px' }}>
              Loan Summary
            </div>
            {[
              ['Principal', '$5,000 USDC'],
              ['Interest (4.5% APR / 90 days)', '$56.25'],
              ['Total Repayment', '$5,056.25'],
              ['Due Date', 'Sep 25, 2025'],
            ].map(([label, value]) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{label}</span>
                <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>{value}</span>
              </div>
            ))}
          </div>

          <button style={{
            width: '100%', padding: '11px', borderRadius: '7px',
            background: 'var(--accent-green)', border: 'none',
            color: '#fff', fontSize: '14px', fontWeight: 600, cursor: 'pointer',
          }}>
            Request Loan →
          </button>
        </div>

        {/* RIGHT SIDE */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

          {/* Available collateral */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px', padding: '20px' }}>
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '14px' }}>
              Available Collateral
            </div>
            {tokenizedCommodities.map(c => (
              <div key={c.id} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '10px 0', borderBottom: '1px solid var(--border)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{
                    width: '30px', height: '30px', borderRadius: '6px',
                    background: 'var(--accent-green-bg)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '14px',
                  }}>
                    {c.image}
                  </div>
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-primary)' }}>{c.name}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{c.tokenSymbol}</div>
                  </div>
                </div>
                <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                  ${c.tokenValue.toLocaleString()}
                </span>
              </div>
            ))}
          </div>

          {/* Info box */}
          <div style={{
            background: 'var(--accent-blue-bg)', border: '1px solid #bcd9f5',
            borderRadius: '8px', padding: '16px',
          }}>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
              <InformationCircleIcon style={{ width: '16px', height: '16px', color: 'var(--accent-blue)', flexShrink: 0 }} />
              <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--accent-blue)' }}>Important</span>
            </div>
            {[
              'Maximum LTV ratio is 75% of collateral value.',
              'Your commodity tokens will be locked until repayment.',
              'Liquidation occurs if collateral health drops below 120%.',
              'Loans are disbursed in USDC to your connected wallet.',
            ].map(note => (
              <div key={note} style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px', paddingLeft: '24px' }}>
                • {note}
              </div>
            ))}
          </div>
        </div>
      </div>

    </DashboardLayout>
  )
}