import { OpenPosition } from "../types.js";
import { logger } from "../logger.js";
import { config } from "../config.js";

export class RiskManager {
  private openPositions = new Map<string, OpenPosition>();
  private lastBuyAt = new Map<string, number>();
  private realizedPnlTodaySol = 0;
  private dayKey = this.todayKey();

  private todayKey(): string {
    return new Date().toISOString().slice(0, 10); // UTC date
  }

  private rolloverIfNewDay() {
    const key = this.todayKey();
    if (key !== this.dayKey) {
      logger.info(`New UTC day — resetting daily loss counter (was ${this.realizedPnlTodaySol.toFixed(4)} SOL)`);
      this.dayKey = key;
      this.realizedPnlTodaySol = 0;
    }
  }

  currentExposureSol(): number {
    let sum = 0;
    for (const p of this.openPositions.values()) sum += p.entrySol;
    return sum;
  }

  /** Call before every buy. Returns a reason string if blocked, or null if OK. */
  canOpenPosition(mint: string, sizeSol: number): string | null {
    this.rolloverIfNewDay();

    if (this.realizedPnlTodaySol <= -config.risk.dailyLossCapSol) {
      return `daily loss cap hit (${this.realizedPnlTodaySol.toFixed(4)} SOL) — no new trades until UTC rollover`;
    }
    if (sizeSol > config.risk.maxPositionSol) {
      return `position size ${sizeSol} SOL exceeds MAX_POSITION_SOL (${config.risk.maxPositionSol})`;
    }
    if (this.currentExposureSol() + sizeSol > config.risk.maxExposureSol) {
      return `would exceed MAX_EXPOSURE_SOL (current ${this.currentExposureSol().toFixed(4)} + ${sizeSol} > ${config.risk.maxExposureSol})`;
    }
    const last = this.lastBuyAt.get(mint);
    if (last && Date.now() - last < config.risk.perTokenCooldownSec * 1000) {
      return `per-token cooldown active for ${mint}`;
    }
    if (this.openPositions.has(mint)) {
      return `already holding a position in ${mint}`;
    }
    return null;
  }

  recordOpen(mint: string, entrySol: number, entryTokenAmount: number) {
    this.openPositions.set(mint, { mint, entrySol, entryTokenAmount, openedAt: Date.now() });
    this.lastBuyAt.set(mint, Date.now());
  }

  recordClose(mint: string, exitSol: number) {
    const pos = this.openPositions.get(mint);
    if (!pos) return;
    const pnl = exitSol - pos.entrySol;
    this.realizedPnlTodaySol += pnl;
    this.openPositions.delete(mint);
    logger.trade(
      `Closed ${mint}: entry ${pos.entrySol.toFixed(4)} SOL, exit ${exitSol.toFixed(4)} SOL, pnl ${pnl >= 0 ? "+" : ""}${pnl.toFixed(4)} SOL. Day total: ${this.realizedPnlTodaySol.toFixed(4)} SOL`
    );
  }

  getOpenPosition(mint: string): OpenPosition | undefined {
    return this.openPositions.get(mint);
  }
}
