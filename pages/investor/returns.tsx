import DashboardLayout from '../../components/layout/DashboardLayout'
import { liquidityPools, earningsChartData, transactions } from '../../lib/mockData'
import { ArrowDownTrayIcon, TrophyIcon } from '@heroicons/react/24/outline'

export default function MyReturns() {
  return (
    <DashboardLayout userType="investor">

      {/* HEADER */}
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.3px', marginBottom: '4px' }}>
          My Returns
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
          Track your earnings and withdraw returns from your positions.
        </p>
      </div>

      {/* STATS */}
      <div className="stat-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '28px' }}>
        {[
          { label: 'Total Earned', value: '$3,240', sub: 'All time', color: 'var(--accent-green)' },
          { label: 'This Month', value: '$1,240', sub: '+38% vs last month', color: 'var(--accent-green)' },
          { label: 'Pending Returns', value: '$284', sub: 'Claimable now', color: 'var(--accent-gold)' },
          { label: 'Avg APY', value: '8.8%', sub: 'Across all pools', color: 'var(--text-primary)' },
        ].map(s => (
          <div key={s.label} style={{
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: '8px', padding: '16px',
          }}>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px' }}>{s.label}</div>
            <div style={{ fontSize: '20px', fontWeight: 700, color: s.color, marginBottom: '4px' }}>{s.value}</div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{s.sub}</div>
          </div>
        ))}
      </div>

      {/* EARNINGS CHART — simple visual */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px', padding: '20px', marginBottom: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>Earnings Over Time</span>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Last 6 months</span>
        </div>

        {/* Bar chart */}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '12px', height: '120px' }}>
          {earningsChartData.map((d, i) => {
            const max = Math.max(...earningsChartData.map(x => x.earned))
            const height = (d.earned / max) * 100
            return (
              <div key={d.month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', height: '100%', justifyContent: 'flex-end' }}>
                <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>${d.earned}</span>
                <div style={{
                  width: '100%', borderRadius: '4px 4px 0 0',
                  height: `${height}%`,
                  background: i === earningsChartData.length - 1 ? 'var(--accent-green)' : 'var(--accent-green-bg)',
                  border: i === earningsChartData.length - 1 ? 'none' : '1px solid #c8e6c8',
                  minHeight: '4px',
                }} />
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{d.month}</span>
              </div>
            )
          })}
        </div>
      </div>

      <div className="two-col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>

        {/* POSITIONS */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px', padding: '20px' }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '16px' }}>
            Active Positions
          </div>
          {liquidityPools.filter(p => p.myDeposit > 0).map(pool => (
            <div key={pool.id} style={{
              padding: '14px', borderRadius: '6px', marginBottom: '10px',
              background: 'var(--bg-secondary)', border: '1px solid var(--border)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '18px' }}>{pool.image}</span>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>{pool.name}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{pool.apy}% APY</div>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                    ${pool.myDeposit.toLocaleString()}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--accent-green)' }}>
                    +${Math.round(pool.myDeposit * pool.apy / 100 / 12)}/mo
                  </div>
                </div>
              </div>
              <button style={{
                width: '100%', padding: '7px', borderRadius: '5px', fontSize: '12px',
                background: 'transparent', border: '1px solid var(--border-light)',
                color: 'var(--text-secondary)', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px',
              }}>
                <ArrowDownTrayIcon style={{ width: '13px', height: '13px' }} />
                Withdraw
              </button>
            </div>
          ))}
        </div>

        {/* RECENT EARNINGS */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px', padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>Recent Transactions</span>
          </div>
          {transactions.map((tx, i) => (
            <div key={tx.id} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '10px 0', borderBottom: i < transactions.length - 1 ? '1px solid var(--border)' : 'none',
            }}>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>{tx.type}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{tx.date}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: tx.amount > 0 ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                  {tx.amount > 0 ? `$${tx.amount.toLocaleString()}` : '—'}
                </div>
                <span style={{
                  fontSize: '10px', fontWeight: 600, padding: '2px 6px', borderRadius: '3px',
                  background: tx.status === 'confirmed' ? 'var(--accent-green-bg)' : 'var(--accent-gold-bg)',
                  color: tx.status === 'confirmed' ? 'var(--accent-green)' : 'var(--accent-gold)',
                }}>
                  {tx.status}
                </span>
              </div>
            </div>
          ))}

          {/* Claim button */}
          <div style={{
            marginTop: '16px', padding: '14px', borderRadius: '6px',
            background: 'var(--accent-gold-bg)', border: '1px solid #f5e6b8',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <div>
              <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--accent-gold)' }}>Pending Returns</div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)' }}>$284.00</div>
            </div>
            <button style={{
              padding: '8px 16px', borderRadius: '6px', fontSize: '13px',
              background: 'var(--accent-gold)', border: 'none',
              color: '#fff', cursor: 'pointer', fontWeight: 600,
            }}>
              Claim →
            </button>
          </div>
        </div>
      </div>

    </DashboardLayout>
  )
}