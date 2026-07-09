import DashboardLayout from '../../components/layout/DashboardLayout'
import { liquidityPools } from '../../lib/mockData'
import { ArrowUpTrayIcon, ShieldCheckIcon, InformationCircleIcon } from '@heroicons/react/24/outline'

export default function Deposit() {
  return (
    <DashboardLayout userType="investor">

      {/* HEADER */}
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.3px', marginBottom: '4px' }}>
          Deposit Funds
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
          Provide liquidity to a commodity pool and start earning returns.
        </p>
      </div>

      <div className="two-col" style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '24px' }}>

        {/* FORM */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px', padding: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '24px' }}>
            <div style={{
              width: '32px', height: '32px', borderRadius: '6px',
              background: 'var(--accent-gold-bg)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <ArrowUpTrayIcon style={{ width: '16px', height: '16px', color: 'var(--accent-gold)' }} />
            </div>
            <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
              New Deposit
            </span>
          </div>

          {/* Select pool */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
              Select Pool
            </label>
            <select style={{
              width: '100%', padding: '9px 12px', borderRadius: '6px',
              border: '1px solid var(--border-light)', background: 'var(--bg-secondary)',
              fontSize: '13px', color: 'var(--text-primary)', outline: 'none',
            }}>
              <option value="">Choose a liquidity pool</option>
              {liquidityPools.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name} — {p.apy}% APY ({p.risk} risk)
                </option>
              ))}
            </select>
          </div>

          {/* Pool preview */}
          <div style={{
            padding: '14px', borderRadius: '6px', marginBottom: '16px',
            background: 'var(--bg-secondary)', border: '1px solid var(--border)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Total Pool Liquidity</span>
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>$250,000</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Current APY</span>
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--accent-green)' }}>8.4%</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Utilization</span>
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>72%</span>
            </div>
          </div>

          {/* Amount */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
              Deposit Amount (USDC)
            </label>
            <input
              type="number"
              placeholder="e.g. 10000"
              style={{
                width: '100%', padding: '9px 12px', borderRadius: '6px',
                border: '1px solid var(--border-light)', background: 'var(--bg-secondary)',
                fontSize: '13px', color: 'var(--text-primary)', outline: 'none',
              }}
            />
            <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
              {['$1,000', '$5,000', '$10,000', '$25,000'].map(amount => (
                <button key={amount} style={{
                  padding: '4px 10px', borderRadius: '4px', fontSize: '11px',
                  border: '1px solid var(--border-light)', background: 'transparent',
                  color: 'var(--text-secondary)', cursor: 'pointer',
                }}>
                  {amount}
                </button>
              ))}
            </div>
          </div>

          {/* Earnings preview */}
          <div style={{
            padding: '14px', borderRadius: '6px', marginBottom: '20px',
            background: 'var(--accent-gold-bg)', border: '1px solid #f5e6b8',
          }}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--accent-gold)', marginBottom: '10px' }}>
              Estimated Earnings
            </div>
            {[
              ['Monthly', '$70.00'],
              ['Quarterly', '$210.00'],
              ['Annually', '$840.00'],
            ].map(([period, amount]) => (
              <div key={period} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{period}</span>
                <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>{amount}</span>
              </div>
            ))}
          </div>

          <button style={{
            width: '100%', padding: '11px', borderRadius: '7px',
            background: 'var(--accent-green)', border: 'none',
            color: '#fff', fontSize: '14px', fontWeight: 600, cursor: 'pointer',
          }}>
            Confirm Deposit →
          </button>
        </div>

        {/* RIGHT */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

          {/* My current deposits */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px', padding: '20px' }}>
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '14px' }}>
              My Current Deposits
            </div>
            {liquidityPools.filter(p => p.myDeposit > 0).map(pool => (
              <div key={pool.id} style={{
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
                    {pool.image}
                  </div>
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-primary)' }}>{pool.name}</div>
                    <div style={{ fontSize: '11px', color: 'var(--accent-green)' }}>{pool.apy}% APY</div>
                  </div>
                </div>
                <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                  ${pool.myDeposit.toLocaleString()}
                </span>
              </div>
            ))}
          </div>

          {/* Security note */}
          <div style={{
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: '8px', padding: '20px',
          }}>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
              <ShieldCheckIcon style={{ width: '16px', height: '16px', color: 'var(--accent-green)', flexShrink: 0 }} />
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>Your funds are protected</span>
            </div>
            {[
              'All pools are backed by verified physical commodities.',
              'Smart contracts are audited and open-source.',
              'Oracle price feeds prevent manipulation.',
              'Withdraw anytime — no lock-up periods.',
            ].map(note => (
              <div key={note} style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px', display: 'flex', gap: '6px' }}>
                <span style={{ color: 'var(--accent-green)', flexShrink: 0 }}>✓</span>
                {note}
              </div>
            ))}
          </div>
        </div>
      </div>

    </DashboardLayout>
  )
}