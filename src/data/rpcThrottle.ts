import { logger } from "../logger.js";

const MIN_INTERVAL_MS = Number(process.env.RPC_MIN_INTERVAL_MS ?? 250); // ~4 req/s ceiling

let queue: Promise<void> = Promise.resolve();
let lastCallAt = 0;

/**
 * Runs `fn` no sooner than MIN_INTERVAL_MS after the previous throttled
 * call. This does NOT make the free public RPC fast — it just keeps the
 * bot under the rate limit instead of 429-storming and crashing. If
 * you're still seeing constant 429s with this in place, the fix isn't a
 * bigger interval, it's a real RPC provider (see README's "upgrading the
 * data layer" section) — the public endpoint's ceiling is just low.
 */
export function throttledRpcCall<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  const run = async (): Promise<T> => {
    const wait = Math.max(0, lastCallAt + MIN_INTERVAL_MS - Date.now());
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastCallAt = Date.now();

    try {
      return await fn();
    } catch (err: any) {
      const is429 = err?.message?.includes("429") || err?.message?.includes("Too Many Requests");
      if (is429 && retries > 0) {
        const backoff = MIN_INTERVAL_MS * (4 - retries) * 2; // small linear backoff
        logger.warn(`RPC 429 — backing off ${backoff}ms (${retries} retries left)`);
        await new Promise((r) => setTimeout(r, backoff));
        return throttledRpcCall(fn, retries - 1);
      }
      throw err;
    }
  };

  // Chain onto the shared queue so calls never overlap, regardless of
  // how many events fire concurrently.
  const result = queue.then(run);
  queue = result.then(
    () => undefined,
    () => undefined // don't let one failure break the chain for later calls
  );
  return result;
}
