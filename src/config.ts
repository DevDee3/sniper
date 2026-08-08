import "dotenv/config";

function requireEnv(key: string): string {
  const v = process.env[key];
  if (!v || v.trim() === "") {
    throw new Error(
      `Missing required env var ${key}. Copy .env.example to .env and fill it in.`
    );
  }
  return v;
}

function num(key: string, fallback: number): number {
  const v = process.env[key];
  if (!v) return fallback;
  const n = Number(v);
  if (Number.isNaN(n)) throw new Error(`Env var ${key} must be a number, got "${v}"`);
  return n;
}

function bool(key: string, fallback: boolean): boolean {
  const v = process.env[key];
  if (v === undefined) return fallback;
  return v.toLowerCase() === "true";
}

function list(key: string): string[] {
  const v = process.env[key];
  if (!v || v.trim() === "") return [];
  return v.split(",").map((s) => s.trim()).filter(Boolean);
}

// CLI --mode= overrides env MODE
function resolveMode(): "snipe" | "copy" | "both" {
  const arg = process.argv.find((a) => a.startsWith("--mode="));
  const raw = (arg ? arg.split("=")[1] : process.env.MODE) ?? "snipe";
  if (raw !== "snipe" && raw !== "copy" && raw !== "both") {
    throw new Error(`MODE must be snipe | copy | both, got "${raw}"`);
  }
  return raw;
}

export const config = {
  rpcHttpUrl: requireEnv("RPC_HTTP_URL"),
  rpcWsUrl: requireEnv("RPC_WS_URL"),
  solanaTrackerApiKey: process.env.SOLANA_TRACKER_API_KEY ?? "",

  walletPrivateKey: requireEnv("WALLET_PRIVATE_KEY"),

  mode: resolveMode(),
  copyTargetWallets: list("COPY_TARGET_WALLETS"),

  risk: {
    maxPositionSol: num("MAX_POSITION_SOL", 0.05),
    maxExposureSol: num("MAX_EXPOSURE_SOL", 0.2),
    dailyLossCapSol: num("DAILY_LOSS_CAP_SOL", 0.3),
    perTokenCooldownSec: num("PER_TOKEN_COOLDOWN_SEC", 60),
    slippageBps: num("SLIPPAGE_BPS", 300),
    priorityFeeMicroLamports: num("PRIORITY_FEE_MICROLAMPORTS", 200_000),
    takeProfitPct: num("TAKE_PROFIT_PCT", 50),
    stopLossPct: num("STOP_LOSS_PCT", 25),
    exitPollIntervalSec: num("EXIT_POLL_INTERVAL_SEC", 5),
  },

  snipeFilters: {
    maxDevHoldingPct: num("MAX_DEV_HOLDING_PCT", 15),
    requireMetadata: bool("REQUIRE_METADATA", true),
    creatorBlocklist: new Set(list("CREATOR_BLOCKLIST")),
  },

  copyFilters: {
    minMirrorTradeSol: num("MIN_MIRROR_TRADE_SOL", 0.02),
    mirrorSizingMode: (process.env.MIRROR_SIZING_MODE ?? "fixed") as
      | "fixed"
      | "proportional",
  },
} as const;

// Fail fast and loud if copy/both mode has no targets — this is the #1
// "bot runs but does nothing" support request.
if ((config.mode === "copy" || config.mode === "both") && config.copyTargetWallets.length === 0) {
  throw new Error(
    "MODE is copy/both but COPY_TARGET_WALLETS is empty. Add at least one wallet to mirror."
  );
}
