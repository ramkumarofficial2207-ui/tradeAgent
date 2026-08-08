import { EventEmitter } from 'events';

export interface LiveTick {
    ticker: string;
    securityId: string;
    ltp: number;
    prevClose: number;
    dayHigh: number;
    dayLow: number;
    volume: number;
    dayChange: number;
    dayChangePct: number;
    ema20?: number;
    ema50?: number;
    dma200?: number;
    rsi14?: number;
    lastUpdated: number;
}

export interface BreakoutEvent {
    ticker: string;
    type: 'BUY_ZONE_HIT' | 'TARGET_HIT' | 'STOP_LOSS_HIT';
    price: number;
    targetPrice?: number;
    timestamp: number;
}

class LiveTickerStore extends EventEmitter {
    private ticks = new Map<string, LiveTick>();
    private securityToTickerMap = new Map<string, string>();
    private tickerToSecurityMap = new Map<string, string>();

    constructor() {
        super();
        this.setMaxListeners(50);
    }

    /**
     * Map Security ID (Dhan internal) to Trading Symbol (e.g., 2885 -> RELIANCE)
     */
    public registerSymbolMapping(securityId: string, ticker: string): void {
        this.securityToTickerMap.set(securityId, ticker);
        this.tickerToSecurityMap.set(ticker, securityId);
    }

    public getTickerForSecurityId(securityId: string): string | undefined {
        return this.securityToTickerMap.get(securityId);
    }

    public getSecurityIdForTicker(ticker: string): string | undefined {
        return this.tickerToSecurityMap.get(ticker);
    }

    /**
     * Update live tick from WebSocket feed
     */
    public updateTick(raw: {
        securityId: string;
        ltp: number;
        dayHigh?: number;
        dayLow?: number;
        volume?: number;
        prevClose?: number;
    }): LiveTick | null {
        const ticker = this.securityToTickerMap.get(raw.securityId) || raw.securityId;
        const existing = this.ticks.get(ticker);

        const prevClose = raw.prevClose ?? existing?.prevClose ?? raw.ltp;
        const dayChange = raw.ltp - prevClose;
        const dayChangePct = prevClose > 0 ? (dayChange / prevClose) * 100 : 0;

        const updated: LiveTick = {
            ticker,
            securityId: raw.securityId,
            ltp: raw.ltp,
            prevClose,
            dayHigh: Math.max(raw.dayHigh ?? raw.ltp, existing?.dayHigh ?? raw.ltp),
            dayLow: Math.min(raw.dayLow ?? raw.ltp, existing?.dayLow ?? raw.ltp),
            volume: raw.volume ?? existing?.volume ?? 0,
            dayChange,
            dayChangePct,
            ema20: existing?.ema20,
            ema50: existing?.ema50,
            dma200: existing?.dma200,
            rsi14: existing?.rsi14,
            lastUpdated: Date.now(),
        };

        this.ticks.set(ticker, updated);
        this.emit('tick', updated);
        return updated;
    }

    /**
     * Seed technical baselines for a ticker
     */
    public setIndicators(ticker: string, indicators: { ema20?: number; ema50?: number; dma200?: number; rsi14?: number; prevClose?: number }): void {
        const existing = this.ticks.get(ticker) || {
            ticker,
            securityId: this.tickerToSecurityMap.get(ticker) || '',
            ltp: indicators.prevClose || 0,
            prevClose: indicators.prevClose || 0,
            dayHigh: indicators.prevClose || 0,
            dayLow: indicators.prevClose || 0,
            volume: 0,
            dayChange: 0,
            dayChangePct: 0,
            lastUpdated: Date.now(),
        };

        if (indicators.ema20 !== undefined) existing.ema20 = indicators.ema20;
        if (indicators.ema50 !== undefined) existing.ema50 = indicators.ema50;
        if (indicators.dma200 !== undefined) existing.dma200 = indicators.dma200;
        if (indicators.rsi14 !== undefined) existing.rsi14 = indicators.rsi14;
        if (indicators.prevClose !== undefined) existing.prevClose = indicators.prevClose;

        this.ticks.set(ticker, existing);
    }

    public getTick(ticker: string): LiveTick | undefined {
        return this.ticks.get(ticker);
    }

    public getAllTicks(): LiveTick[] {
        return Array.from(this.ticks.values());
    }
}

export const liveTickerStore = new LiveTickerStore();
