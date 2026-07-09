import DashboardLayout from '../../components/layout/DashboardLayout'
import { farmerStats, loans, commodities } from '../../lib/mockData'

export default function FarmerDashboard() {
  return (
    <DashboardLayout userType="farmer">

      {/* PAGE HEADER */}
      <div style={{ marginBottom: '32px' }}>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
          Here&apos;s an overview of your farm portfolio today.
        </p>
      </div>

      {/* STAT CARDS */}
      <div className="stat-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '32px' }}>
        {farmerStats.map(stat => (
          <div key={stat.label} style={{
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: '8px', padding: '16px',
          }}>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px' }}>
              {stat.label}
            </div>
            <div style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.5px', marginBottom: '6px' }}>
              {stat.value}
            </div>
            <div style={{ fontSize: '12px', color: stat.up ? 'var(--accent-green)' : 'var(--accent-red)' }}>
              {stat.change}
            </div>
          </div>
        ))}
      </div>

      {/* TWO COLUMN ROW */}
      <div className="two-col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>

        {/* ACTIVE LOANS */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px', padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>Active Loans</span>
            <span style={{ fontSize: '12px', color: 'var(--accent-green)', cursor: 'pointer' }}>View all →</span>
          </div>
          {loans.filter(l => l.status === 'active').map(loan => (
            <div key={loan.id} style={{
              padding: '12px', borderRadius: '6px',
              background: 'var(--bg-secondary)', marginBottom: '8px',
              border: '1px solid var(--border)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>
                  {loan.commodity}
                </span>
                <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                  ${loan.borrowed.toLocaleString()}
                </span>
              </div>
              <div style={{ marginBottom: '4px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Collateral health</span>
                  <span style={{ fontSize: '11px', color: loan.collateralHealth > 80 ? 'var(--accent-green)' : 'var(--accent-gold)' }}>
                    {loan.collateralHealth}%
                  </span>
                </div>
                <div style={{ height: '4px', background: 'var(--border)', borderRadius: '2px' }}>
                  <div style={{
                    height: '100%', borderRadius: '2px',
                    width: `${loan.collateralHealth}%`,
                    background: loan.collateralHealth > 80 ? 'var(--accent-green)' : 'var(--accent-gold)',
                  }} />
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Due {loan.dueDate}</span>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{loan.interestRate}% APR</span>
              </div>
            </div>
          ))}
        </div>

        {/* COMMODITIES SNAPSHOT */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px', padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>My Commodities</span>
            <span style={{ fontSize: '12px', color: 'var(--accent-green)', cursor: 'pointer' }}>View all →</span>
          </div>
          {commodities.map(c => (
            <div key={c.id} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '10px 0', borderBottom: '1px solid var(--border)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  width: '32px', height: '32px', borderRadius: '6px',
                  background: 'var(--accent-green-bg)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '16px',
                }}>
                  {c.image}
                </div>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>{c.name}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{c.quantity.toLocaleString()} {c.unit}</div>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                  ${c.tokenValue.toLocaleString()}
                </div>
                <span style={{
                  fontSize: '10px', fontWeight: 600, padding: '2px 6px', borderRadius: '4px',
                  display: 'inline-block', marginTop: '2px',
                  background: c.status === 'tokenized' ? 'var(--accent-green-bg)' : c.status === 'collateral' ? 'var(--accent-gold-bg)' : 'var(--accent-blue-bg)',
                  color: c.status === 'tokenized' ? 'var(--accent-green)' : c.status === 'collateral' ? 'var(--accent-gold)' : 'var(--accent-blue)',
                }}>
                  {c.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

    </DashboardLayout>
  )
}