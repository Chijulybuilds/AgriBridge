import { existsSync } from "node:fs";
import { homedir, platform } from "node:os";
import { join } from "node:path";

/** Finds a Foundry binary (forge, anvil, cast) in $FOUNDRY_BIN, ~/.foundry/bin, or else relies on PATH. */
export function foundryTool(name) {
  const exe = platform() === "win32" ? `${name}.exe` : name;
  const dirs = [process.env.FOUNDRY_BIN, join(homedir(), ".foundry", "bin")].filter(Boolean);
  return dirs.map((dir) => join(dir, exe)).find((path) => existsSync(path)) ?? name;
}
