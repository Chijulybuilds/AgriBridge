                    Farmer verifies Identity from Frontend
                       │
                       ▼
        Submit Farm Commodity (Request from frontend)
                       │
                       ▼
             Commodity Registry (saved to commodity registry both on-chain and DataBase from Frontend)
                       │
                       ▼
          Authorized Verifier Review (Backend Engineer is the verifier)
                       │
          ┌────────────┴────────────┐
          │                         │
      Reject Request          Approve Request 
                                      │
                                      ▼
                           Mint ERC-1155 Commodity (The quantity of Agri-Token minted from supply and price from Oracle)
                                      │
                                      ▼
                          Deposit as Collateral (Deposit Agri-Token to Lending pool)
                                      │
                           Commodity Price Oracle¬¬¬ 
                                      │
                                      ▼
                               Lending Pool
                           ┌───────────────┐
                           │               │
                           ▼               ▼
                  Borrow Stablecoin   Investor Deposits 
                           │               │
                           └──────► Yield Distribution

 
src/
├── LendingPool.sol              // Core protocol (Accepts only USDC from Investors and CommodityToken as collateral from farmers)             6
├── CommodityToken.sol           // ERC-1155 collateral       4
├── LiquidityShareToken.sol      // agUSDC receipt token        5
├── CommodityRegistry.sol        // Commodity records    1
Commodity Name: Coco
Quantity: 1000kg
Grade: A
Estimated Market Price: $6,500
Harvest Date: 20 June 2026
Storage Duration: 180 Days
├── CommodityVerifier.sol        // Approval workflow       3
├── CommodityPriceOracle.sol     // Price source            2

NOTE: An Investor can get USDC from faucet.circle.com then import to wallet to deposit to the pool.
