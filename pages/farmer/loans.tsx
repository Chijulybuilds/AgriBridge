import DashboardLayout from '../../components/layout/DashboardLayout'
import withAuth from '../../components/withAuth'

function MyLoans() {
  const activeLoans: any[] = []
  const transactions: any[] = []

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
          { label: 'Total Borrowed', value: '$0' },
          { label: 'Active Loans', value: '0' },
          { label: 'Total Repaid', value: '$0' },
          { label: 'Next Due', value: '—' },
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

        {activeLoans.length === 0 ? (
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', padding: '24px', textAlign: 'center' }}>
            No loan history found.
          </p>
        ) : (
          <p>Loan list</p>
        )}
      </div>

      {/* TRANSACTION HISTORY */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>Transaction History</span>
        </div>

        {transactions.length === 0 ? (
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', padding: '24px', textAlign: 'center' }}>
            No transactions found.
          </p>
        ) : (
          <p>Transaction list</p>
        )}
      </div>

    </DashboardLayout>
  )
}

export default withAuth(MyLoans, "farmer")