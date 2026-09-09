// AGRIBRIDGE MOCK DATA
// Replace these with real API calls later

// --- FARMER DATA ---
export const farmerProfile = {
  name: "Chukwuemeka Obi",
  walletAddress: "0x1a2b...9f3c",
  location: "Enugu, Nigeria",
  joinedDate: "Jan 2025",
  totalCommodities: 4,
  activeLoanCount: 2,
  creditScore: 87,
};

// --- COMMODITIES ---
export const commodities = [
  {
    id: "c001",
    name: "Cocoa Beans",
    quantity: 5000,
    unit: "kg",
    quality: "Grade A",
    location: "Ondo State Warehouse, Nigeria",
    tokenSymbol: "COCOA-001",
    tokenValue: 12500, // USD
    status: "tokenized", // tokenized | pending | collateral
    dateAdded: "2025-03-10",
    image: "🫘",
  },
  {
    id: "c002",
    name: "Cassava",
    quantity: 12000,
    unit: "kg",
    quality: "Grade B",
    location: "Oyo State Warehouse, Nigeria",
    tokenSymbol: "CASS-002",
    tokenValue: 8400,
    status: "collateral",
    dateAdded: "2025-04-02",
    image: "🌿",
  },
  {
    id: "c003",
    name: "Maize",
    quantity: 8000,
    unit: "kg",
    quality: "Grade A",
    location: "Kaduna State Warehouse, Nigeria",
    tokenSymbol: "MAIZ-003",
    tokenValue: 6200,
    status: "pending",
    dateAdded: "2025-05-18",
    image: "🌽",
  },
  {
    id: "c004",
    name: "Palm Oil",
    quantity: 3000,
    unit: "litres",
    quality: "Grade A",
    location: "Rivers State Warehouse, Nigeria",
    tokenSymbol: "PALM-004",
    tokenValue: 9800,
    status: "tokenized",
    dateAdded: "2025-06-01",
    image: "🫙",
  },
];

// --- LOANS ---
export const loans = [
  {
    id: "l001",
    commodity: "Cocoa Beans",
    tokenSymbol: "COCOA-001",
    borrowed: 8000,
    collateralValue: 12500,
    collateralHealth: 78, // percentage
    interestRate: 4.5,
    dueDate: "2025-09-10",
    status: "active", // active | repaid | liquidated
    startDate: "2025-03-15",
  },
  {
    id: "l002",
    commodity: "Cassava",
    tokenSymbol: "CASS-002",
    borrowed: 5000,
    collateralValue: 8400,
    collateralHealth: 92,
    interestRate: 3.8,
    dueDate: "2025-10-02",
    status: "active",
    startDate: "2025-04-05",
  },
  {
    id: "l003",
    commodity: "Maize",
    tokenSymbol: "MAIZ-003",
    borrowed: 4000,
    collateralValue: 6200,
    collateralHealth: 100,
    interestRate: 5.0,
    dueDate: "2025-08-18",
    status: "repaid",
    startDate: "2025-02-01",
  },
];

// --- FARMER DASHBOARD STATS ---
export const farmerStats = [
  { label: "Total Collateral Value", value: "$27,100", change: "+12.4%", up: true },
  { label: "Total Borrowed", value: "$13,000", change: "+5.2%", up: true },
  { label: "Active Loans", value: "2", change: "0%", up: true },
  { label: "Credit Score", value: "87/100", change: "+3pts", up: true },
];

// --- INVESTOR DATA ---
export const investorProfile = {
  name: "Amara Nwosu",
  walletAddress: "0x7d4e...2a1f",
  joinedDate: "Feb 2025",
  totalDeposited: 45000,
  totalEarned: 3240,
  activePositions: 3,
};

// --- LIQUIDITY POOLS ---
export const liquidityPools = [
  {
    id: "p001",
    name: "Cocoa Pool",
    commodity: "Cocoa Beans",
    totalLiquidity: 250000,
    myDeposit: 15000,
    apy: 8.4,
    utilization: 72, // percentage
    risk: "low",
    image: "🫘",
  },
  {
    id: "p002",
    name: "Cassava Pool",
    commodity: "Cassava",
    totalLiquidity: 180000,
    myDeposit: 20000,
    apy: 10.2,
    utilization: 85,
    risk: "medium",
    image: "🌿",
  },
  {
    id: "p003",
    name: "Palm Oil Pool",
    commodity: "Palm Oil",
    totalLiquidity: 320000,
    myDeposit: 10000,
    apy: 7.8,
    utilization: 61,
    risk: "low",
    image: "🫙",
  },
  {
    id: "p004",
    name: "Maize Pool",
    commodity: "Maize",
    totalLiquidity: 95000,
    myDeposit: 0,
    apy: 12.5,
    utilization: 91,
    risk: "high",
    image: "🌽",
  },
];

// --- INVESTOR DASHBOARD STATS ---
export const investorStats = [
  { label: "Total Deposited", value: "$45,000", change: "+8.1%", up: true },
  { label: "Total Earned", value: "$3,240", change: "+22.4%", up: true },
  { label: "Active Positions", value: "3", change: "", up: true },
  { label: "Avg APY", value: "8.8%", change: "+0.4%", up: true },
];

// --- CHART DATA (for dashboard area charts) ---
export const portfolioChartData = [
  { month: "Jan", value: 30000 },
  { month: "Feb", value: 32000 },
  { month: "Mar", value: 29500 },
  { month: "Apr", value: 38000 },
  { month: "May", value: 41000 },
  { month: "Jun", value: 45000 },
];

export const earningsChartData = [
  { month: "Jan", earned: 200 },
  { month: "Feb", earned: 380 },
  { month: "Mar", earned: 420 },
  { month: "Apr", earned: 680 },
  { month: "May", earned: 890 },
  { month: "Jun", earned: 1240 },
];

// --- TRANSACTIONS ---
export const transactions = [
  {
    id: "tx001",
    type: "Borrow",
    amount: 8000,
    token: "COCOA-001",
    date: "2025-03-15",
    status: "confirmed",
    hash: "0xabc...123",
  },
  {
    id: "tx002",
    type: "Deposit",
    amount: 15000,
    token: "USDC",
    date: "2025-03-20",
    status: "confirmed",
    hash: "0xdef...456",
  },
  {
    id: "tx003",
    type: "Repay",
    amount: 4200,
    token: "MAIZ-003",
    date: "2025-04-10",
    status: "confirmed",
    hash: "0xghi...789",
  },
  {
    id: "tx004",
    type: "Tokenize",
    amount: 0,
    token: "PALM-004",
    date: "2025-06-01",
    status: "confirmed",
    hash: "0xjkl...012",
  },
  {
    id: "tx005",
    type: "Withdraw",
    amount: 5000,
    token: "USDC",
    date: "2025-06-15",
    status: "pending",
    hash: "0xmno...345",
  },
];

// --- NOTIFICATIONS ---
export const notifications = [
  {
    id: "n001",
    type: "warning",
    message: "Cassava collateral health dropped to 78%. Consider topping up.",
    date: "2 hours ago",
    read: false,
  },
  {
    id: "n002",
    type: "success",
    message: "Loan repayment of $4,200 confirmed on-chain.",
    date: "1 day ago",
    read: false,
  },
  {
    id: "n003",
    type: "info",
    message: "Palm Oil token (PALM-004) successfully minted.",
    date: "3 days ago",
    read: true,
  },
  {
    id: "n004",
    type: "success",
    message: "Earned $380 in returns from Cocoa Pool this month.",
    date: "5 days ago",
    read: true,
  },
];