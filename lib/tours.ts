/**
 * The tutorials' scripts. Each step circles one real thing on the screen (its `data-tour` name) and
 * says, in simple words, what it is and what pressing it does. A step with a `page` opens that page
 * first. When the thing can't be shown (before signing in, for example), the step appears in the
 * middle of the screen with its picture instead, so the tour always makes sense.
 *
 * Writing rules: one idea per step, short sentences, everyday words, no blockchain words.
 */
import type { IllustrationName } from "../components/help/Illustration";

export type TourLength = "short" | "full";

export type TourStep = {
  /** The \`data-tour\` name of the thing to circle. */
  target?: string;
  /** Open this page before the step. */
  page?: string;
  title: string;
  body: string;
  /** What happens when you press it. */
  press?: string;
  /** A drawing, or a screenshot with the button circled; shown when there is nothing to circle. */
  picture?: IllustrationName | { src: string; alt: string };
  /** Show the picture even when the thing is circled. */
  alwaysShowPicture?: boolean;
};

export type Tour = { id: string; title: string; short: TourStep[]; full: TourStep[] };

/* ───────────── Steps shared between the short and full app tours ───────────── */

const helpIcon: TourStep = {
  target: "info-icon",
  title: "Not sure what something means? Tap the \"i\"",
  body: "You will see a small \"i\" next to many words and buttons. Tap it and a short note explains, in simple words, what that thing is, why it matters to you, and what to do.",
  press: "A note opens. Tap anywhere else to close it. You can do this as often as you like.",
  picture: "info",
  alwaysShowPicture: true,
};

const tutorialButton: TourStep = {
  target: "tutorial-button",
  title: "Watch this tour again any time",
  body: "This Tutorial button is at the top of every page. Each section also has a \"How this page works\" button with a short guide for that page.",
  press: "You can choose the short tour or the full one again.",
};

/** Google sign-in (MetaMask Embedded Wallets) is on when a client ID is set; the tests use their own wallet. */
const GOOGLE = Boolean(process.env.NEXT_PUBLIC_WEB3AUTH_CLIENT_ID) && !process.env.NEXT_PUBLIC_E2E;

const signIn: TourStep = GOOGLE
  ? {
      target: "connect-wallet",
      title: "Sign in with Google",
      body: "Tap \"Continue with Google\" and choose your Google account. The first time, AgriBridge creates your account for you, a wallet in your name, and connects it. There is no app to install and no new password.",
      press: "Google's sign-in window opens. Choose your account; a moment later you are in. Prefer MetaMask or email? Use \"Other ways\" below it.",
      picture: "wallet",
    }
  : {
  target: "connect-wallet",
  title: "Sign in with MetaMask",
  body: "MetaMask is a free app that works as your AgriBridge account. It keeps your dollars and your crop, and asks you to say \"yes\" before anything happens. There is no password to remember.",
  press: "MetaMask opens. Check the details, then tap \"Connect\". Install MetaMask first from metamask.io if you don't have it.",
  picture: "wallet",
    };

const roles: TourStep = {
  target: "role-switch",
  title: "Farmer, Investor or Buyer",
  body: "These tabs change which tools you see. Farmers store crop and borrow. Investors lend dollars to farmers. Buyers buy crop. You can switch at any time.",
  press: "The menu below changes to that role's pages. Your crop and dollars stay the same.",
  picture: "roles",
};

const testDollars: TourStep = {
  target: "test-dollars",
  title: "Free play money to practise",
  body: "This version of AgriBridge uses test dollars, so you can try everything without risking real money.",
  press: "MetaMask asks you to confirm. A few seconds later, your test dollars appear at the top.",
  picture: "money",
};

const confirmStep: TourStep = {
  title: "Every action needs your \"yes\"",
  body: "When you press a button like \"Take the advance\", MetaMask opens and shows what will happen. Nothing happens until you tap \"Confirm\". Then wait about 15 seconds for the green \"Done\" message.",
  picture: "wallet",
};

const deliver: TourStep = {
  page: "/farmer/deliver",
  target: "deliver-form",
  title: "Step 1 for farmers: book a delivery",
  body: "Tell AgriBridge which crop you are bringing, to which warehouse, about how many kilograms, and when you harvested it.",
  press: "Your delivery is booked as \"Pending\". Take the crop to the warehouse; they weigh it and check its quality.",
  picture: "deliver",
};

const checked: TourStep = {
  page: "/stock",
  target: "lot-list",
  title: "Your crop, checked and stored",
  body: "Once the warehouse has weighed and graded your crop, it appears here in My stock: how many kilograms, its grade (A is best), and what it is worth today.",
  picture: "warehouse",
};

const advance: TourStep = {
  page: "/farmer/advance",
  target: "advance-form",
  title: "Get cash without selling your crop",
  body: "An advance is a loan backed by your crop in the warehouse. Choose the crop, the date you will pay back, and how much you need.",
  press: "After you confirm, the dollars arrive in your wallet. Your crop stays in the warehouse until you repay.",
  picture: "advance",
};

const repay: TourStep = {
  page: "/farmer/loans",
  target: "loans-list",
  title: "Repay and get your crop back",
  body: "My advances shows what you owe and how safe each advance is. Pay back by the end date to get your crop back and build a good record.",
  press: "\"Repay all and get my crop back\" pays everything you owe and releases your crop.",
  picture: "record",
};

const invest: TourStep = {
  page: "/investor",
  target: "invest-form",
  title: "For investors: lend to farmers and earn",
  body: "Investors put dollars into one shared pool. Farmers borrow from it and pay interest, which goes back to the investors.",
  press: "Your dollars join the pool and start earning straight away. You can take them back when enough is free.",
  picture: "invest",
};

const market: TourStep = {
  page: "/market",
  target: "listings",
  title: "The market: buy and sell crop",
  body: "Farmers sell stored crop here, and buyers buy any amount by the kilogram. The weight, grade and warehouse are all checked.",
  press: "Buying makes the crop yours. You can then collect it from the warehouse or sell it again.",
  picture: "market",
};

const activity: TourStep = {
  page: "/activity",
  target: "activity-feed",
  title: "Everything is on a public record",
  body: "Activity lists everything that happens on AgriBridge. Nobody can change or delete it, so the warehouse, investors and buyers all see the same facts.",
  picture: "shield",
};

const finish: TourStep = {
  title: "You are ready",
  body: "Remember: tap the \"i\" whenever something is unclear, and press \"Tutorial\" at the top to watch this again. Each page also has a \"How this page works\" guide.",
  picture: "welcome",
};

export const APP_TOUR: Tour = {
  id: "app",
  title: "AgriBridge tour",
  short: [helpIcon, tutorialButton, signIn, roles, deliver, advance, invest, market, finish],
  full: [
    helpIcon,
    tutorialButton,
    signIn,
    GOOGLE
      ? {
          title: "Keep your Google account safe",
          body: "Your AgriBridge wallet opens with your Google account, so protect it: use a strong password and turn on Google's 2-step verification. Never share your password or sign-in codes, not even with AgriBridge.",
          picture: "shield",
        }
      : {
          title: "Keep your secret words safe",
          body: "When you create a MetaMask wallet, it gives you 12 secret words. Write them on paper and keep them safe. Anyone with these words can take everything. Never share them, not even with AgriBridge.",
          picture: "shield",
        },
    roles,
    testDollars,
    {
      target: "dollar-balance",
      title: "Your dollars",
      body: "This shows how many dollars are in your wallet right now.",
      picture: "money",
    },
    confirmStep,
    {
      title: "A tiny fee on each action",
      body: "Each action pays a very small network fee in a coin called Sepolia ETH. On this test version it is free. If you see \"Not enough funds to pay the network fee\", ask the AgriBridge team for a top-up.",
      picture: "money",
    },
    deliver,
    {
      page: "/farmer/deliver",
      target: "deliver-submit",
      title: "Book the delivery",
      body: "Check what you typed, then press this button and confirm in MetaMask.",
      press: "The delivery shows as \"Pending\" until the warehouse checks it.",
    },
    checked,
    {
      page: "/stock",
      target: "lot-list",
      title: "Crop slowly loses value as it ages",
      body: "Every crop moves from Grade A to B to C over time, until it expires. Open a lot to see what it will be worth each month. Sell, borrow or collect before it expires.",
      picture: "clock",
      alwaysShowPicture: true,
    },
    advance,
    {
      page: "/farmer/advance",
      target: "advance-limit",
      title: "How much you can borrow",
      body: "You can borrow about half of what your crop will be worth on the day you pay back (less for crops that spoil fast). This keeps you safe if prices fall.",
      press: "\"Max\" fills in the most you can borrow. You can always take less.",
    },
    {
      page: "/farmer/advance",
      target: "advance-submit",
      title: "Take the advance",
      body: "Check the amount and the interest estimate, then press this and confirm in MetaMask.",
      press: "The dollars arrive in your wallet within about 15 seconds.",
    },
    repay,
    {
      title: "If prices fall a lot",
      body: "If your crop's value falls until the advance reaches 80% of it, part of the crop can be sold to repay up to half. You keep the dollars you borrowed, and the rest of your crop stays yours. Repaying early avoids this.",
      picture: "shield",
    },
    {
      page: "/farmer",
      target: "credit-record",
      title: "Build a good record",
      body: "Each advance of $500 or more that you repay on time, after at least two weeks, is added to your record. Three good repayments raise how much you can borrow.",
      picture: "record",
      alwaysShowPicture: true,
    },
    {
      page: "/market/sell",
      target: "sell-form",
      title: "Sell your crop",
      body: "Choose the crop and how many kilograms to sell. Pick a price that follows the market, or a fixed price. You can offer a discount to buyers who buy a lot.",
      press: "Your crop is listed on the market. When someone buys, the dollars come to you.",
      picture: "market",
    },
    market,
    {
      page: "/stock/collect",
      target: "collect-form",
      title: "Collect crop from the warehouse",
      body: "When you want your crop out of the warehouse, ask for it here: pick it up yourself, or have it delivered. The storage fee is shown before you agree.",
      picture: "warehouse",
    },
    invest,
    {
      page: "/investor",
      target: "investor-stats",
      title: "How investors are protected",
      body: "A fifth of all interest goes into a loss cushion. If an advance can't be fully repaid, the cushion pays first. Every advance is also backed by crop in a warehouse.",
      picture: "shield",
    },
    activity,
    finish,
  ],
};

/* ───────────────────────────── Section tours ───────────────────────────── */

export type SectionId = "farmer" | "deliver" | "stock" | "collect" | "advance" | "loans" | "sell" | "market" | "investor" | "risk";

const section = (id: SectionId, title: string, steps: TourStep[]): Tour => ({ id, title, short: steps, full: steps });

export const SECTION_TOURS: Record<SectionId, Tour> = {
  farmer: section("farmer", "Farmer overview", [
    { target: "farmer-stats", title: "Your farm at a glance", body: "How much your stored crop is worth, deliveries waiting to be checked, what you owe, and how much the pool can lend right now.", picture: "warehouse" },
    { target: "next-step", title: "What to do next", body: "This box suggests your next step. Once your crop is verified, it shows how much you can take today, in one press.", press: "The dollars arrive in your wallet. Sell the crop later at your price: each sale pays the advance back first." },
    { target: "sell-or-wait", title: "Sell now or wait?", body: "Compares selling today with keeping the crop a few months on an advance. It shows how much prices would need to rise for waiting to pay.", picture: "clock" },
    { target: "credit-record", title: "Your repayment record", body: "Good repayments raise how much you can borrow. This shows your progress.", picture: "record" },
    { target: "nav", title: "The menu", body: "Use the menu to move between your pages: deliver a crop, my stock, get an advance, my advances, sell, the market and activity." },
    helpIcon,
  ]),
  deliver: section("deliver", "Delivering crop", [
    { target: "deliver-form", title: "Book a delivery", body: "Choose the crop, the warehouse, about how many kilograms, and the harvest date. The warehouse weighs it, so your guess only needs to be close.", picture: "deliver" },
    { target: "deliver-submit", title: "Send the booking", body: "Press this and confirm in MetaMask.", press: "Your delivery shows below as \"Pending\" until the warehouse checks it." },
    { target: "deliveries-list", title: "Your deliveries", body: "Each delivery and where it is: Pending (not checked yet), Verified (in your stock), or Rejected. You can cancel a pending one." },
  ]),
  stock: section("stock", "My stock", [
    { target: "stock-summary", title: "What you own", body: "The value of all your stored crop, how many kilograms, and how much is close to expiring.", picture: "warehouse" },
    { target: "lot-list", title: "Each lot", body: "One line per delivery: its grade, kilograms and value today. Open one to see its value month by month as it ages.", picture: "clock" },
  ]),
  collect: section("collect", "Collecting crop", [
    { target: "collect-form", title: "Take crop out of the warehouse", body: "Choose the lot, the kilograms, and pickup or delivery. The storage fee is worked out by the day and shown before you agree.", press: "The warehouse is told. Once they release the crop, it leaves your stock.", picture: "warehouse" },
  ]),
  advance: section("advance", "Getting an advance", [
    { target: "advance-form", title: "Borrow against your crop", body: "Choose the crop, how many kilograms back the advance, and the date you will pay back.", picture: "advance" },
    { target: "advance-limit", title: "Your limit", body: "The most you can borrow, about half of what the crop will be worth on the repay date. A good repayment record raises it." },
    { target: "advance-rules", title: "Read this before you borrow", body: "The crop's value today, your borrow limit, the interest, and what happens if prices fall. Tap the \"i\" next to anything unclear." },
    { target: "advance-submit", title: "Take the advance", body: "Press this and confirm in MetaMask.", press: "The dollars arrive in your wallet. Your crop stays in the warehouse until you repay." },
  ]),
  loans: section("loans", "My advances", [
    { target: "loans-list", title: "What you owe", body: "Each advance shows what you owe now, the date to repay by, and how safe it is.", picture: "record" },
    { target: "loan-safety", title: "Healthy or at risk", body: "\"Healthy\" is safe. \"At risk\" means prices have fallen a lot: repay some of the advance to make it safe again." },
    { target: "repay-all", title: "Repay and get your crop back", body: "Pays everything you owe and releases your crop to you.", press: "MetaMask asks you to confirm, and may first ask once to allow AgriBridge to take the payment." },
    { target: "sell-to-repay", title: "Or sell to repay", body: "Put the crop behind an advance on the market at your price. Each sale pays back its share of the advance, and you get the rest at once." },
  ]),
  sell: section("sell", "Selling crop", [
    { target: "sell-form", title: "Put crop up for sale", body: "Choose the lot and the kilograms to sell.", picture: "market" },
    { target: "price-mode", title: "Choose your price", body: "\"Follow the market\" keeps your price in line with today's crop price. \"Fixed price\" stays the same until you change it." },
    { target: "bulk-deal", title: "Reward big buyers", body: "Optional: a discount for buyers who buy a lot at once, for example 10% off orders of 200 kg or more." },
    { target: "get-paid-today", title: "Get paid today", body: "Tick this to take part of the money now while your crop waits at your price. Each sale pays the advance back first, and you get the rest. No need to sell cheap to get cash quickly.", picture: "advance" },
  ]),
  market: section("market", "The market", [
    { target: "market-filters", title: "Find the crop you want", body: "Filter by crop, grade and warehouse.", picture: "market" },
    { target: "listings", title: "Listings", body: "Each listing shows the price per kilogram, how many kilograms are left, the grade and when it changes, and any bulk deal.", press: "Choose how many kilograms to buy. The total is shown, with any discount, before you confirm." },
  ]),
  investor: section("investor", "Investing", [
    { target: "investor-stats", title: "The pool at a glance", body: "How much is in the pool, how much is lent out, what investors earn now, and the loss cushion that protects you.", picture: "invest" },
    { target: "invest-form", title: "Invest or withdraw", body: "Enter an amount and press Invest. To take money out, switch to Withdraw.", press: "Your dollars join the pool and start earning. MetaMask may first ask once to allow AgriBridge to use your dollars." },
    { target: "position", title: "Your share", body: "What your share of the pool is worth now, including what it has earned." },
  ]),
  risk: section("risk", "The Risk page", [
    { target: "risk-table", title: "Every advance, in the open", body: "Each open advance, how safe it is, and the crop backing it. This is what your money is lent against.", picture: "shield" },
    { target: "crop-rules", title: "The rules for each crop", body: "How much can be borrowed against each crop, when an advance is settled, and the reward for settling it." },
  ]),
};
