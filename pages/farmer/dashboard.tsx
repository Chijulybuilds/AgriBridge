import DashboardLayout from '../../components/layout/DashboardLayout'
import withAuth from '../../components/withAuth'
import { useEffect, useState } from 'react'
import { getMyCommodities } from '../../lib/api'
import { useRouter } from 'next/router'

function FarmerDashboard() {
  const router = useRouter()
  const [commodities, setCommodities] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  
  useEffect(() => {
    let mounted = true;
    getMyCommodities()
      .then((data) => {
        if (mounted) setCommodities(Array.isArray(data) ? data : [])
      })
      .catch((err) => console.error("Failed to load dashboard commodities:", err))
      .finally(() => {
        if (mounted) setLoading(false)
      })
    return () => {
      mounted = false
    }
  }, [])

  // Calculate dynamic stats from live DB records
  const totalValue = commodities.reduce((sum, c) => {
    const qty = c.quantity_kg !== undefined ? c.quantity_kg : (c.quantity || 0)
    let pricePerKg = 2.5
    const type = (c.commodity_type || c.type || c.name || "").toLowerCase()
    if (type.includes("maize")) pricePerKg = 0.8
    else if (type.includes("rice")) pricePerKg = 1.2
    
    const val = c.tokenValue !== undefined ? c.tokenValue : qty * pricePerKg
    return sum + val
  }, 0)

  const activeLoans = [] // Stored on-chain; clear mock values to show true status
  const creditScore = 100 // Default initial credit score

  const stats = [
    { label: "Total Collateral Value", value: `$${totalValue.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`, change: "Live", up: true },
    { label: "Total Borrowed", value: "$0", change: "Live", up: true },
    { label: "Active Loans", value: "0", change: "Live", up: true },
    { label: "Credit Score", value: `${creditScore}/100`, change: "Initial", up: true },
  ]

  return (
    <DashboardLayout userType="farmer">
      {/* PAGE HEADER */}
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '6px' }}>
          Farmer Dashboard
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
          Here&apos;s an overview of your farm portfolio today.
        </p>
      </div>

      {/* STAT CARDS */}
      <div className="stat-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '32px' }}>
        {stats.map(stat => (
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
            <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)' }}>
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
            <span onClick={() => router.push("/farmer/loans")} style={{ fontSize: '12px', color: 'var(--accent-green)', cursor: 'pointer' }}>View all →</span>
          </div>
          {activeLoans.length === 0 ? (
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', padding: '20px 0', textAlign: 'center' }}>
              No active loans found.
            </p>
          ) : (
            <p>Active loan details</p>
          )}
        </div>

        {/* COMMODITIES SNAPSHOT */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px', padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>My Commodities</span>
            <span onClick={() => router.push("/farmer/commodities")} style={{ fontSize: '12px', color: 'var(--accent-green)', cursor: 'pointer' }}>View all →</span>
          </div>
          
          {loading ? (
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', padding: '20px 0', textAlign: 'center' }}>Loading...</p>
          ) : commodities.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '30px 0' }}>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '12px' }}>No commodities registered yet.</p>
              <button
                onClick={() => router.push("/farmer/tokenize")}
                style={{
                  padding: '6px 12px', borderRadius: '6px', background: 'var(--accent-green)',
                  color: '#fff', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: 600
                }}
              >
                Tokenize First Asset
              </button>
            </div>
          ) : (
            commodities.slice(0, 4).map(c => {
              const type = c.commodity_type || c.type || c.name || "Unknown"
              const qty = c.quantity_kg !== undefined ? c.quantity_kg : (c.quantity || 0)
              const unit = c.unit || "kg"
              
              let pricePerKg = 2.5
              if (type.toLowerCase().includes("maize")) pricePerKg = 0.8
              else if (type.toLowerCase().includes("rice")) pricePerKg = 1.2
              const value = c.tokenValue !== undefined ? c.tokenValue : qty * pricePerKg

              const isVerified = c.status === "Verified" || c.status === "tokenized"
              const isCollateral = c.status === "Collateralized" || c.status === "collateral"
              const isRejected = c.status === "Rejected"

              let icon = "🌾"
              const typeLower = type.toLowerCase()
              if (typeLower.includes("cocoa")) icon = "🫘"
              else if (typeLower.includes("cassava") || typeLower.includes("yam")) icon = "🌿"
              else if (typeLower.includes("maize")) icon = "🌽"
              else if (typeLower.includes("oil")) icon = "🫙"

              return (
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
                      {icon}
                    </div>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>{type}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{qty.toLocaleString()} {unit}</div>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                      ${value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                    </div>
                    <span style={{
                      fontSize: '10px', fontWeight: 600, padding: '2px 6px', borderRadius: '4px',
                      display: 'inline-block', marginTop: '2px',
                      background: isVerified
                        ? 'var(--accent-green-bg)'
                        : isCollateral
                        ? 'var(--accent-gold-bg)'
                        : isRejected
                        ? '#fdecea'
                        : 'var(--accent-blue-bg)',
                      color: isVerified
                        ? 'var(--accent-green)'
                        : isCollateral
                        ? 'var(--accent-gold)'
                        : isRejected
                        ? '#b71c1c'
                        : 'var(--accent-blue)',
                    }}>
                      {(c.status || "Pending").toLowerCase()}
                    </span>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

    </DashboardLayout>
  )
}

export default withAuth(FarmerDashboard, "farmer")