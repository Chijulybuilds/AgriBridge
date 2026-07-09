import DashboardLayout from '../../components/layout/DashboardLayout'
import { loans, transactions } from '../../lib/mockData'
import { ArrowPathIcon } from '@heroicons/react/24/outline'

export default function MyLoans() {
  return (
    <DashboardLayout userType="farmer">

      {/* HEADER */}
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.3px', marginBottom: '4px' }}>
          My Loans
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
          Track and manage all your active and past loans.
        </p>
      </div>

      {/* STATS */}
      <div className="stat-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '28px' }}>
        {[
          { label: 'Total Borrowed', value: '$13,000' },
          { label: 'Active Loans', value: '2' },
          { label: 'Total Repaid', value: '$4,200' },
          { label: 'Next Due', value: 'Sep 10' },
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

      {/* LOANS LIST */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px', marginBottom: '24px', overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>All Loans</span>
        </div>

        {/* Header */}
        <div style={{
          display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr 1fr 1fr 1fr',
          padding: '10px 20px', background: 'var(--bg-secondary)',
          fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)',
          textTransform: 'uppercase', letterSpacing: '0.5px',
          borderBottom: '1px solid var(--border)',
        }}>
          <span>Commodity</span>
          <span>Borrowed</span>
          <span>Collateral</span>
          <span>Health</span>
          <span>Due Date</span>
          <span>Status</span>
        </div>

        {loans.map((loan, i) => (
          <div key={loan.id} style={{
            display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr 1fr 1fr 1fr',
            padding: '14px 20px', alignItems: 'center',
            borderBottom: i < loans.length - 1 ? '1px solid var(--border)' : 'none',
          }}>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>{loan.commodity}</div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{loan.tokenSymbol}</div>
            </div>
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
              ${loan.borrowed.toLocaleString()}
            </span>
            <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
              ${loan.collateralValue.toLocaleString()}
            </span>

            {/* Health bar */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
                <span style={{ fontSize: '12px', fontWeight: 600, color: loan.collateralHealth > 80 ? 'var(--accent-green)' : 'var(--accent-gold)' }}>
                  {loan.collateralHealth}%
                </span>
              </div>
              <div style={{ height: '3px', background: 'var(--border)', borderRadius: '2px', width: '60px' }}>
                <div style={{
                  height: '100%', borderRadius: '2px',
                  width: `${Math.min(loan.collateralHealth, 100)}%`,
                  background: loan.collateralHealth > 80 ? 'var(--accent-green)' : 'var(--accent-gold)',
                }} />
              </div>
            </div>

            <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{loan.dueDate}</span>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{
                fontSize: '11px', fontWeight: 600, padding: '3px 8px', borderRadius: '4px',
                background: loan.status === 'active' ? 'var(--accent-blue-bg)' : loan.status === 'repaid' ? 'var(--accent-green-bg)' : 'var(--accent-red-bg)',
                color: loan.status === 'active' ? 'var(--accent-blue)' : loan.status === 'repaid' ? 'var(--accent-green)' : 'var(--accent-red)',
              }}>
                {loan.status}
              </span>
              {loan.status === 'active' && (
                <button style={{
                  display: 'flex', alignItems: 'center', gap: '4px',
                  padding: '4px 10px', borderRadius: '5px', fontSize: '11px',
                  background: 'var(--accent-green)', border: 'none',
                  color: '#fff', cursor: 'pointer', fontWeight: 600,
                }}>
                  <ArrowPathIcon style={{ width: '11px', height: '11px' }} />
                  Repay
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* TRANSACTION HISTORY */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>Transaction History</span>
        </div>

        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr',
          padding: '10px 20px', background: 'var(--bg-secondary)',
          fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)',
          textTransform: 'uppercase', letterSpacing: '0.5px',
          borderBottom: '1px solid var(--border)',
        }}>
          <span>Type</span>
          <span>Amount</span>
          <span>Date</span>
          <span>Status</span>
        </div>

        {transactions.map((tx, i) => (
          <div key={tx.id} style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr',
            padding: '12px 20px', alignItems: 'center',
            borderBottom: i < transactions.length - 1 ? '1px solid var(--border)' : 'none',
          }}>
            <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>{tx.type}</span>
            <span style={{ fontSize: '13px', color: tx.amount > 0 ? 'var(--text-primary)' : 'var(--text-muted)' }}>
              {tx.amount > 0 ? `$${tx.amount.toLocaleString()}` : '—'}
            </span>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{tx.date}</span>
            <span style={{
              fontSize: '11px', fontWeight: 600, padding: '3px 8px', borderRadius: '4px',
              display: 'inline-block',
              background: tx.status === 'confirmed' ? 'var(--accent-green-bg)' : 'var(--accent-gold-bg)',
              color: tx.status === 'confirmed' ? 'var(--accent-green)' : 'var(--accent-gold)',
            }}>
              {tx.status}
            </span>
          </div>
        ))}
      </div>

    </DashboardLayout>
  )
}