import { MarketDataApi, TradeSetup } from './types';
export declare function calcPositionSize(params: {
    capital: number;
    entry: number;
    stop: number;
    capCategory: string;
    regime: string;
}): {
    qty: number;
    riskRs: number;
    capitalDeployed: number;
};
export declare function addTrade(setup: TradeSetup): Promise<void>;
export declare function manualAddTrade(params: {
    ticker: string;
    sector?: string;
    capCategory?: string;
    setupType?: string;
    entryPrice: number;
    quantity: number;
    stopLoss: number;
    target1: number;
    target2?: number;
    regimeAtEntry?: string;
    confidenceScore?: number;
    notes?: string;
}): Promise<any>;
export declare function closeTrade(tradeId: string, exitPrice: number, exitReason?: 'TARGET' | 'STOP' | 'TRAIL' | 'MANUAL'): Promise<any>;
export declare function updateTrailingStop(tradeId: string, newStop: number): Promise<void>;
export declare function watchTrades(dataApi?: MarketDataApi | null): Promise<any[]>;
export declare function getActiveTrades(): Promise<any[]>;
export declare function getTradeHistory(): Promise<any[]>;
export declare function removeTrade(ticker: string): Promise<void>;
export declare function getPerformanceMetrics(): Promise<any>;
