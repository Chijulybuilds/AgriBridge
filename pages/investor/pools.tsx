import DashboardLayout from '../../components/layout/DashboardLayout'
import { liquidityPools } from '../../lib/mockData'
import { ArrowUpTrayIcon, InformationCircleIcon } from '@heroicons/react/24/outline'

export default function LiquidityPools() {
  return (
    <DashboardLayout userType="investor">

      {/* HEADER */}
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.3px', marginBottom: '4px' }}>
          Liquidity Pools
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
          Browse and deposit into agricultural commodity pools to earn returns.
        </p>
      </div>

      {/* STATS */}
      <div className="stat-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '28px' }}>
        {[
          { label: 'Total Pool Liquidity', value: '$845,000' },
          { label: 'My Total Deposit', value: '$45,000' },
          { label: 'Active Pools', value: '4' },
          { label: 'Highest APY', value: '12.5%' },
        ].map(s => (
          <div key={s.label} style={{
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: '8px', padding: '16px',
          }}>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px' }}>{s.label}</div>
            <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)' }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* POOLS GRID */}
      <div className="pool-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
        {liquidityPools.map(pool => (
          <div key={pool.id} style={{
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: '8px', padding: '20px',
          }}>
            {/* Pool header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{
                  width: '40px', height: '40px', borderRadius: '8px',
                  background: 'var(--accent-green-bg)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '20px',
                }}>
                  {pool.image}
                </div>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>{pool.name}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{pool.commodity}</div>
                </div>
              </div>
              <span style={{
                fontSize: '11px', fontWeight: 600, padding: '3px 8px', borderRadius: '4px',
                background: pool.risk === 'low' ? 'var(--accent-green-bg)' : pool.risk === 'medium' ? 'var(--accent-gold-bg)' : 'var(--accent-red-bg)',
                color: pool.risk === 'low' ? 'var(--accent-green)' : pool.risk === 'medium' ? 'var(--accent-gold)' : 'var(--accent-red)',
              }}>
                {pool.risk} risk
              </span>
            </div>

            {/* Pool stats */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '16px' }}>
              {[
                { label: 'Total Liquidity', value: `$${pool.totalLiquidity.toLocaleString()}` },
                { label: 'APY', value: `${pool.apy}%`, highlight: true },
                { label: 'Utilization', value: `${pool.utilization}%` },
              ].map(stat => (
                <div key={stat.label} style={{
                  background: 'var(--bg-secondary)', borderRadius: '6px',
                  padding: '10px 12px', border: '1px solid var(--border)',
                }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>{stat.label}</div>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: stat.highlight ? 'var(--accent-green)' : 'var(--text-primary)' }}>
                    {stat.value}
                  </div>
                </div>
              ))}
            </div>

            {/* Utilization bar */}
            <div style={{ marginBottom: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Pool utilization</span>
                <span style={{ fontSize: '11px', color: pool.utilization > 85 ? 'var(--accent-gold)' : 'var(--accent-green)' }}>
                  {pool.utilization}%
                </span>
              </div>
              <div style={{ height: '4px', background: 'var(--border)', borderRadius: '2px' }}>
                <div style={{
                  height: '100%', borderRadius: '2px',
                  width: `${pool.utilization}%`,
                  background: pool.utilization > 85 ? 'var(--accent-gold)' : 'var(--accent-green)',
                }} />
              </div>
            </div>

            {/* My deposit */}
            {pool.myDeposit > 0 && (
              <div style={{
                padding: '10px 12px', borderRadius: '6px', marginBottom: '14px',
                background: 'var(--accent-green-bg)', border: '1px solid #c8e6c8',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>My deposit</span>
                <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--accent-green)' }}>
                  ${pool.myDeposit.toLocaleString()}
                </span>
              </div>
            )}

            <button style={{
              width: '100%', padding: '9px', borderRadius: '6px',
              background: pool.myDeposit > 0 ? 'transparent' : 'var(--accent-green)',
              border: pool.myDeposit > 0 ? '1px solid var(--border-light)' : 'none',
              color: pool.myDeposit > 0 ? 'var(--text-primary)' : '#fff',
              fontSize: '13px', fontWeight: 600, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
            }}>
              <ArrowUpTrayIcon style={{ width: '14px', height: '14px' }} />
              {pool.myDeposit > 0 ? 'Add More' : 'Deposit Now'}
            </button>
          </div>
        ))}
      </div>

    </DashboardLayout>
  )
}