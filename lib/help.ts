/**
 * Plain-English help for everything in AgriBridge that a person who has never used a crypto app
 * might not understand. Each topic answers three questions in short sentences: what it is, why it
 * matters to you, and what to do. Every "i" button in the app, the help page and the tutorials
 * read from here, so a word is always explained the same way.
 *
 * Writing rules: short sentences, everyday words, "you" for the reader, no blockchain words unless
 * the screen shows them (then explain them once, simply).
 */
export type HelpTopic = {
  /** The word or button, as the screen shows it. */
  title: string;
  what: string;
  why: string;
  todo: string;
  /** Where the topic belongs on the help page. */
  group: HelpGroup;
};

export type HelpGroup = "Getting started" | "Your crop" | "Advances" | "Investing" | "Buying and selling" | "Safety and records";

export const HELP_GROUPS: HelpGroup[] = ["Getting started", "Your crop", "Advances", "Investing", "Buying and selling", "Safety and records"];

export const HELP = {
  /* ─────────────── Getting started ─────────────── */
  "info-icon": {
    group: "Getting started",
    title: "The \"i\" button",
    what: "A small \"i\" sits next to words and buttons that may be new to you. Tap it and a short note explains that thing in simple words.",
    why: "You never have to guess. Help is always one tap away, on every page.",
    todo: "Whenever you are not sure what something means or what a button does, tap the \"i\" beside it. Tap anywhere outside the note to close it.",
  },
  tutorial: {
    group: "Getting started",
    title: "Tutorial",
    what: "A guided walk through the app. It dims the screen, circles the button to press, and tells you what it does.",
    why: "It shows you, step by step, how to do each thing, so you can learn by watching.",
    todo: "Tap \"Tutorial\" at the top of any page to watch it again. Choose the short version for a quick look, or the full one to learn everything.",
  },
  wallet: {
    group: "Getting started",
    title: "Wallet",
    what: "Your wallet is your account on AgriBridge. It holds your dollars and your crop, and it is how you say \"yes\" to each action.",
    why: "Only you can use your wallet. Nobody can move your money or crop without your yes.",
    todo: "Keep your wallet's secret recovery words written on paper in a safe place. Never tell them to anybody, not even AgriBridge.",
  },
  metamask: {
    group: "Getting started",
    title: "MetaMask",
    what: "MetaMask is the wallet app AgriBridge uses. It is free. On a phone it is an app; on a computer it is an add-on to your web browser.",
    why: "You need it to sign in and to confirm each action, such as taking an advance or buying crop.",
    todo: "Install MetaMask from metamask.io (only from there), create a wallet, then tap \"Connect MetaMask\" on the sign-in page.",
  },
  "google-sign-in": {
    group: "Getting started",
    title: "Continue with Google",
    what: "Sign in with your Google account. The first time, AgriBridge creates your account, a wallet in your name, and connects it for you. There is nothing to install and no new password.",
    why: "Your wallet holds your dollars and your crop. Its key is split between your Google sign-in, your device and MetaMask's key service, so nobody, not even AgriBridge, can use it without you.",
    todo: "Tap \"Continue with Google\" and choose your Google account. Next time, sign in with the same Google account to get the same wallet back.",
  },
  "sign-in": {
    group: "Getting started",
    title: "Sign in",
    what: "Signing in connects your MetaMask wallet to AgriBridge. There is no password to remember.",
    why: "Once you are signed in, the app can show your crop, your dollars and your advances.",
    todo: "Tap \"Connect MetaMask\". A MetaMask window opens. Check it, then tap \"Connect\".",
  },
  "network-fee": {
    group: "Getting started",
    title: "Network fee",
    what: "A very small fee paid every time you do something that is saved on the public record, like taking an advance. It is paid in a coin called Sepolia ETH.",
    why: "Without it, your action cannot be saved. On this test version, the coin is free and has no real value.",
    todo: "If an action says there are not enough funds for the network fee, ask the AgriBridge team for a top-up.",
  },
  "test-dollars": {
    group: "Getting started",
    title: "Get test dollars",
    what: "This version of AgriBridge uses play money. \"Get test dollars\" gives you some, free.",
    why: "You can try every part of the app, borrowing, investing and buying, without risking real money.",
    todo: "Tap \"Get test dollars\" at the top of the page, then confirm in MetaMask. Your dollars appear next to the wallet icon.",
  },
  "dollar-balance": {
    group: "Getting started",
    title: "Your dollars",
    what: "The number next to the wallet icon at the top is how many dollars you have in your wallet right now. The naira figure beside it uses a fixed demo rate of ₦1,500 to $1, to help you picture it; AgriBridge itself works in dollars.",
    why: "You need dollars to invest, buy crop, repay an advance or pay a storage fee.",
    todo: "Check it before you pay for something. If it is too low, get test dollars or receive dollars from a sale.",
  },
  roles: {
    group: "Getting started",
    title: "Farmer, Investor, Buyer",
    what: "These three tabs change which tools you see. A farmer stores and borrows; an investor lends; a buyer buys crop.",
    why: "Each person sees only what they need, so the screens stay simple.",
    todo: "Tap the role you want to act as. You can switch at any time; your crop and dollars stay the same.",
  },
  confirm: {
    group: "Getting started",
    title: "Confirm in your wallet",
    what: "After you press a button like \"Take the advance\", MetaMask opens and asks you to confirm. Nothing happens until you say yes.",
    why: "It protects you: no action can happen by mistake or without you.",
    todo: "Read what MetaMask shows, then tap \"Confirm\". Wait for the green message that says it is done. It usually takes about 15 seconds.",
  },
  activity: {
    group: "Getting started",
    title: "Activity",
    what: "A list of everything that has happened on AgriBridge: deliveries, advances, sales and price changes, newest first.",
    why: "Anyone can check it, so nothing can be hidden. Each line has a link to the public record that proves it.",
    todo: "Open Activity to see what happened and when. Tap a line's link to see the proof.",
  },
  "public-record": {
    group: "Getting started",
    title: "Public record",
    what: "Every action on AgriBridge is written into a public record that nobody can change or delete afterwards. The \"View\" links open it on a website called Etherscan.",
    why: "It means the warehouse, investors and buyers cannot quietly change what happened. Everyone sees the same facts.",
    todo: "You don't need to do anything. If you want proof of something, tap its \"View\" link.",
  },

  /* ─────────────── Your crop ─────────────── */
  deliver: {
    group: "Your crop",
    title: "Deliver a crop",
    what: "Tell AgriBridge you are bringing crop to a partner warehouse: which crop, which warehouse, about how many kilograms, and when it was harvested.",
    why: "This books your delivery. The warehouse expects you and checks your crop when you arrive.",
    todo: "Fill in the form, tap \"Book the delivery\" and confirm in MetaMask. Then take your crop to the warehouse you chose.",
  },
  warehouse: {
    group: "Your crop",
    title: "Warehouse",
    what: "A partner store where your crop is kept safe, weighed and checked.",
    why: "Your crop stays there while you borrow against it or sell it. Buyers collect it from there.",
    todo: "Choose the warehouse closest to you. You pay for the storage only when the crop is collected.",
  },
  pending: {
    group: "Your crop",
    title: "Pending",
    what: "Your delivery is booked, but the warehouse has not weighed and checked it yet.",
    why: "You cannot borrow against or sell crop until it has been checked.",
    todo: "Take the crop to the warehouse. Once it is checked, it moves to My stock by itself.",
  },
  grade: {
    group: "Your crop",
    title: "Grade (A, B, C)",
    what: "The quality of your crop, given by the warehouse: A is the best, then B, then C.",
    why: "Better grades are worth more. Crop slowly moves down the grades as it ages.",
    todo: "Nothing to do. Your crop's grade and value are shown on My stock.",
  },
  "inspection-report": {
    group: "Your crop",
    title: "Inspection report",
    what: "The warehouse's signed record of your crop's weight and quality.",
    why: "A fingerprint of the report is saved with your crop, so nobody can swap the report later.",
    todo: "Nothing to do. Ask the warehouse for a copy if you want one.",
  },
  stock: {
    group: "Your crop",
    title: "My stock",
    what: "The crop you own that has been checked by a warehouse. One unit is one kilogram.",
    why: "This is what you can borrow against, sell or collect.",
    todo: "Open My stock to see each lot, its grade, what it is worth, and when it expires.",
  },
  lot: {
    group: "Your crop",
    title: "Lot",
    what: "One delivery of crop, with its own number, weight, grade and warehouse, for example \"Cocoa · lot 1\".",
    why: "Each lot is tracked on its own, so you always know which crop is which.",
    todo: "Use the lot number when you talk to the warehouse or sell part of it.",
  },
  "worth-today": {
    group: "Your crop",
    title: "Worth today",
    what: "What your crop is worth now: today's price, times the kilograms, adjusted for its grade and age.",
    why: "It tells you roughly what you could sell it for, and how much it can back an advance.",
    todo: "Check it before you sell or borrow. It changes when the price changes and as the crop ages.",
  },
  ageing: {
    group: "Your crop",
    title: "Value over time",
    what: "Crop loses a little value each day as it ages, from Grade A to B to C, until it expires.",
    why: "It helps you choose when to sell, and it is why an advance is based on what the crop will be worth on the repay date.",
    todo: "Look at the chart to see what your crop will be worth each month. Selling earlier gets a better grade.",
  },
  expiry: {
    group: "Your crop",
    title: "Expires",
    what: "The date after which the crop is too old to be sold as food.",
    why: "After this date you cannot borrow against it, and it can only be sold as animal feed.",
    todo: "Sell, collect or use your crop before it expires. Crop expiring within 30 days is shown on My stock.",
  },
  collect: {
    group: "Your crop",
    title: "Collect",
    what: "Take crop out of the warehouse: pick it up yourself, or ask for it to be delivered.",
    why: "When you collect, those kilograms leave AgriBridge and you pay the storage fee for the time they were stored.",
    todo: "Choose the lot and the kilograms, check the fee shown, then confirm. The warehouse releases the crop.",
  },
  "storage-fee": {
    group: "Your crop",
    title: "Storage fee",
    what: "What the warehouse charges to keep crop, worked out by the day and paid when the crop is collected.",
    why: "The fee is always shown before you agree, so there are no surprises.",
    todo: "Check the fee on the Collect page before you confirm.",
  },

  /* ─────────────── Advances ─────────────── */
  advance: {
    group: "Advances",
    title: "Advance",
    what: "A loan of dollars backed by crop in the warehouse. The crop stays there as security until you pay back.",
    why: "You get cash now without selling your crop at a low harvest-time price.",
    todo: "Go to \"Get an advance\", choose the crop, the kilograms and the repay date, then the amount.",
  },
  "end-date": {
    group: "Advances",
    title: "Repay by (end date)",
    what: "The date by which you plan to pay the advance back.",
    why: "Your limit depends on what the crop will be worth on that date. If you are more than 7 days late, the advance is settled.",
    todo: "Choose a date you can really pay back by. Paying earlier costs less interest.",
  },
  "borrow-limit": {
    group: "Advances",
    title: "Borrow limit",
    what: "The most you can borrow against your crop: about half of what it will be worth on the repay date (less for crops that spoil quickly).",
    why: "Keeping the advance well below the crop's value protects you if the price falls.",
    todo: "Borrow only what you need. Tap \"Max\" to fill in your limit, but you can take less.",
  },
  interest: {
    group: "Advances",
    title: "Interest",
    what: "The cost of borrowing, a small amount added every second the advance is open. It is about 5% a year when little money is lent out, and more when a lot is.",
    why: "The interest pays the investors who lent the dollars.",
    todo: "Repay early to pay less. The estimate is shown before you take the advance.",
  },
  "get-paid-today": {
    group: "Advances",
    title: "Get paid today",
    what: "Take part of the money for your crop now, while it waits on the market at your price. It is an advance from the lending pool, with the listed crop as security.",
    why: "You don't have to cut your price to get cash quickly. Each time a buyer pays, that sale pays back its share of the advance first, and you get the rest straight away.",
    todo: "When you list, tick \"Get paid today\" and choose how much to take now. Ask at least the price shown, so each sale can pay back its share. Whatever is still owed on the repay date, you pay yourself.",
  },
  "gate-advance": {
    group: "Advances",
    title: "Ready today",
    what: "As soon as the warehouse has checked your crop, you can take an advance against it, straight away.",
    why: "Cash for school fees, seed or anything else, without selling your crop cheaply at harvest time.",
    todo: "Press the button on your overview page, or choose another amount. Later, sell the crop at your price: each sale pays the advance back first.",
  },
  "sell-or-wait": {
    group: "Advances",
    title: "Sell now or wait?",
    what: "A comparison of selling your crop today with keeping it in the warehouse for a few months on an advance.",
    why: "Crop is often cheapest at harvest. Waiting can pay, but it costs storage and interest, and the crop ages. This shows how much prices would need to rise for waiting to be worth it.",
    todo: "Choose how long you would wait. If prices usually rise by more than the number shown, waiting may pay. Prices can also fall: nobody can promise they will rise.",
  },
  repay: {
    group: "Advances",
    title: "Repay",
    what: "Paying back the advance and its interest.",
    why: "When you repay in full, your crop is released back to you, and an on-time repayment improves your record.",
    todo: "Open \"My advances\" and tap \"Repay all and get my crop back\", or repay part. Confirm in MetaMask.",
  },
  "safety-level": {
    group: "Advances",
    title: "Safety level (Healthy, At risk)",
    what: "How safe your advance is compared with what your crop is worth. \"Healthy\" is safe; \"At risk\" means the price has fallen a lot.",
    why: "If an advance is at risk, part of the crop can be sold to pay some of it back.",
    todo: "If you see \"At risk\", repay some of the advance to make it healthy again.",
  },
  "sell-price": {
    group: "Advances",
    title: "Sold if the price falls below",
    what: "The crop price at which your advance would become \"At risk\" and part of the crop could be sold.",
    why: "It tells you how far the price can fall before anything happens to your crop.",
    todo: "Compare it with today's price. If they are close, consider repaying some of the advance.",
  },
  settlement: {
    group: "Advances",
    title: "Settled",
    what: "If an advance becomes too risky, someone repays part of it and receives that much of your crop, plus a small reward. If you are more than 7 days late, the whole advance is settled.",
    why: "It protects the investors' money. You always keep the dollars you borrowed, and any crop left over comes back to you.",
    todo: "Avoid it by repaying on time and keeping an eye on the safety level.",
  },
  record: {
    group: "Advances",
    title: "Repayment record",
    what: "A list, kept in your name, of advances you repaid on time, repaid late, or that had to be settled. Advances of $500 or more, open at least two weeks, count.",
    why: "A good record raises how much you can borrow. Nobody can change, move or buy it.",
    todo: "Repay in full by the end date to build your record. Your progress is shown on your overview.",
  },

  /* ─────────────── Investing ─────────────── */
  pool: {
    group: "Investing",
    title: "The pool",
    what: "One shared pot of dollars from all investors. Farmers' advances are paid from it, and their interest flows back into it.",
    why: "Your dollars are spread across many advances, each backed by crop in a warehouse.",
    todo: "Invest to add dollars to the pool. Withdraw when you want them back, if enough is available.",
  },
  invest: {
    group: "Investing",
    title: "Invest",
    what: "Putting your dollars into the pool so they can be lent to farmers.",
    why: "You earn the interest farmers pay. Your share of the pool grows over time.",
    todo: "Enter an amount, tap \"Invest\" and confirm in MetaMask. You may be asked once to allow AgriBridge to use your dollars.",
  },
  shares: {
    group: "Investing",
    title: "Your share of the pool",
    what: "When you invest, you get pool shares that show how much of the pool is yours. As interest comes in, each share is worth more dollars.",
    why: "It is how your earnings are counted, fairly, for every investor.",
    todo: "Nothing to do. Your overview shows what your share is worth in dollars.",
  },
  earnings: {
    group: "Investing",
    title: "What investors earn",
    what: "The yearly rate your dollars are earning right now, from farmers' interest and your share of market fees.",
    why: "It goes up when more of the pool is lent out, and down when less is.",
    todo: "Check it on your overview. It is not guaranteed; it depends on how much farmers borrow.",
  },
  "fee-share": {
    group: "Investing",
    title: "Earned from market fees",
    what: "Half of the fee on every market sale goes to the pool's investors.",
    why: "You earn even when farmers sell their crop instead of borrowing. Each payment counts towards your share gradually over 7 days, so nobody can grab it by investing just before a big sale.",
    todo: "Nothing to do. It is added to what your share is worth.",
  },
  cushion: {
    group: "Investing",
    title: "Loss cushion",
    what: "Money set aside from interest (a fifth of it) to cover losses if an advance cannot be fully repaid.",
    why: "Losses are paid from the cushion first, before investors lose anything.",
    todo: "Nothing to do. Its size is shown on your overview and the Risk page.",
  },
  "available-cash": {
    group: "Investing",
    title: "Available now",
    what: "Dollars in the pool that are not lent out at the moment.",
    why: "Farmers can borrow, and investors can withdraw, only from what is available.",
    todo: "If you want to withdraw more than is available, wait for advances to be repaid.",
  },
  withdraw: {
    group: "Investing",
    title: "Withdraw",
    what: "Taking your dollars, and what they earned, back out of the pool.",
    why: "Your money is never locked forever. You can take it back when enough is available.",
    todo: "Enter an amount or tap \"All\", then confirm in MetaMask.",
  },
  risk: {
    group: "Investing",
    title: "Risk page",
    what: "A list of every open advance, how safe it is, and the prices behind it, plus each crop's rules.",
    why: "You can see exactly what your money is lent against before you invest.",
    todo: "Open \"Risk\" to check how many advances are healthy and how big the cushion is.",
  },

  /* ─────────────── Buying and selling ─────────────── */
  market: {
    group: "Buying and selling",
    title: "Market",
    what: "Where farmers sell crop that is stored in the warehouses, and buyers buy it, by the kilogram.",
    why: "Buyers know exactly what they get: the weight, grade and warehouse are all checked.",
    todo: "Browse the listings, filter by crop or warehouse, and buy any amount you need.",
  },
  sell: {
    group: "Buying and selling",
    title: "Sell",
    what: "Putting some of your crop up for sale on the market.",
    why: "It turns your stored crop into dollars when you are ready.",
    todo: "Choose the lot and kilograms, choose a price, add a bulk deal if you like, then confirm.",
  },
  "market-price": {
    group: "Buying and selling",
    title: "Follow the market",
    what: "Your selling price moves with today's crop price, for example 100% of the market price.",
    why: "You never sell too cheap when prices rise, and buyers always see a fair price.",
    todo: "Choose \"Follow the market\" and set the percentage. Choose \"Fixed price\" if you want one price that does not change.",
  },
  "fixed-price": {
    group: "Buying and selling",
    title: "Fixed price",
    what: "A price per kilogram that you choose and that stays the same.",
    why: "Good if you know exactly what you want to receive.",
    todo: "Enter the price per kilogram. You can change it later from your listings.",
  },
  "bulk-deal": {
    group: "Buying and selling",
    title: "Bulk deal",
    what: "A discount you offer to buyers who buy a lot at once, for example 10% off orders of 200 kg or more.",
    why: "Big buyers are more likely to buy, so you sell more, faster.",
    todo: "Set the discount and the smallest order it applies to. Leave it empty for no bulk deal.",
  },
  "market-fee": {
    group: "Buying and selling",
    title: "Market fee",
    what: "1% of each sale, paid by the buyer on top of the price.",
    why: "Sellers get their full asking price. Half the fee goes to the investors whose money funds farmers' advances, and half runs the market.",
    todo: "Nothing to do. Buyers see the fee and the total before they confirm.",
  },
  buy: {
    group: "Buying and selling",
    title: "Buy",
    what: "Buying some or all of a listing. The crop becomes yours, still in the warehouse.",
    why: "You can then collect it, or sell it again later.",
    todo: "Enter the kilograms, check the total (bulk discount included), then confirm in MetaMask.",
  },
  "expired-stock": {
    group: "Buying and selling",
    title: "Expired stock",
    what: "Crop past its expiry date. AgriBridge buys it at a lower price and sells it as animal feed.",
    why: "Nothing goes to waste, and you still get some money for old crop.",
    todo: "Open \"Expired stock\" from the market and tap \"Sell to AgriBridge\". The price is shown first.",
  },

  /* ─────────────── Safety and records ─────────────── */
  prices: {
    group: "Safety and records",
    title: "Where prices come from",
    what: "Prices for world crops like cocoa come from international markets. Prices for local crops like yam come from approved local market reporters who must agree.",
    why: "A sudden big jump is held and checked again before it is used, so one wrong number can't harm anyone.",
    todo: "Nothing to do. Prices are shown in US dollars per kilogram.",
  },
  reporter: {
    group: "Safety and records",
    title: "Price reporter",
    what: "A person in the local market, approved by AgriBridge, who posts what yam or cashew sells for today.",
    why: "Local crops have no world price, so trusted local reporters provide it. One reporter alone can't change a price: most of them must agree.",
    todo: "If you are a reporter, open \"Report prices\" and send today's price for each crop. Everyone else can see the reports there.",
  },
  frozen: {
    group: "Safety and records",
    title: "Frozen",
    what: "A regulator has paused a lot or a warehouse while they check something.",
    why: "Frozen crop cannot be sold, moved, borrowed against or collected until it is unfrozen.",
    todo: "Contact the AgriBridge team or the warehouse to find out why and when it will end.",
  },
  verifier: {
    group: "Safety and records",
    title: "The warehouse team (verifier)",
    what: "The only people who can confirm deliveries. Every confirmation needs two of them to agree.",
    why: "No single person can create crop that does not exist.",
    todo: "Nothing to do. Their confirmations appear on the Activity page.",
  },
} satisfies Record<string, HelpTopic>;

export type HelpId = keyof typeof HELP;
