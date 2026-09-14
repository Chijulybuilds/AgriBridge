import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescriptConfig from "eslint-config-next/typescript";

/**
 * ESLint 9 flat config, using the native flat configs shipped by
 * eslint-config-next 16.
 *
 * The project had a `lint` script but no config file at all, so linting failed
 * outright and CI never ran it.
 */
export default [
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "forge-out/**",
      "cache/**",
      "broadcast/**",
      "backend/**",
      "lib/openzeppelin-contracts/**",
      "lib/chainlink-evm/**",
      "lib/foundry-devops/**",
      // Generated from Foundry artifacts; not hand-written source.
      "lib/contracts/abis/**",
      "playwright-report/**",
      "test-results/**",
    ],
  },
  ...coreWebVitals,
  ...typescriptConfig,
  {
    rules: {
      // Contract tuples arrive loosely typed from generated ABIs and are
      // narrowed at the call site, so a warning is more useful than an error.
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
];
