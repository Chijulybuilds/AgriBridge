// Chainlink Functions source for FunctionsPriceFeeder: world commodity prices for AgriBridge.
//
// args:    provider symbols, one per commodity, in the feeder's `commodityIds()` order,
//          e.g. ["COCOA", "RICE", "CORN", "SOYBEANS"]
// secrets: API keys for the providers below, uploaded as DON-hosted secrets
// returns: ABI-encoded uint256[]: USD per kilogram with 8 decimals, in args order
//
// Every provider is asked for every symbol. A symbol's price is the median of the providers that
// answered, and at least MIN_SOURCES must answer, so one provider can never set a price alone.
// The on-chain oracle then applies its own bounds and move cap.
//
// PROVIDERS ARE NOT CHOSEN YET. Add one entry per data service the team subscribes to. Each entry
// returns the USD price per metric ton for a symbol, or null when it has none. Shape:
//
//   {
//     name: "exampleProvider",
//     perTon: async (symbol) => {
//       const response = await Functions.makeHttpRequest({
//         url: `https://api.example.com/v1/prices/${symbol}`,
//         headers: { "x-api-key": secrets.EXAMPLE_API_KEY },
//       });
//       if (response.error) return null;
//       return Number(response.data.usdPerMetricTon);
//     },
//   },
const PROVIDERS = [];

const MIN_SOURCES = 2;

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

// USD per metric ton -> USD per kilogram with 8 decimals: / 1,000 kg, * 1e8.
const toOraclePrice = (usdPerTon) => BigInt(Math.round(usdPerTon * 1e5));

// ABI encoding of uint256[]: offset word, length word, then one 32-byte word per value.
const encodeUint256Array = (values) => {
  const words = [32n, BigInt(values.length), ...values];
  const bytes = new Uint8Array(words.length * 32);
  words.forEach((word, i) => {
    let rest = word;
    for (let b = 31; b >= 0; b--) {
      bytes[i * 32 + b] = Number(rest & 0xffn);
      rest >>= 8n;
    }
  });
  return bytes;
};

if (PROVIDERS.length < MIN_SOURCES) {
  throw Error(`Configure at least ${MIN_SOURCES} price providers in commodity-prices.js`);
}

const prices = [];
for (const symbol of args) {
  const answers = await Promise.all(
    PROVIDERS.map((provider) => provider.perTon(symbol).catch(() => null)),
  );
  const valid = answers.filter((value) => Number.isFinite(value) && value > 0);
  if (valid.length < MIN_SOURCES) {
    throw Error(`${symbol}: only ${valid.length} of ${PROVIDERS.length} providers answered`);
  }
  prices.push(toOraclePrice(median(valid)));
}

return encodeUint256Array(prices);
