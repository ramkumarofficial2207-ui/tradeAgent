import { MarketDataApi, TradeSetup } from './types';
export declare function addTrade(setup: TradeSetup): Promise<void>;
export declare function removeTrade(ticker: string): Promise<void>;
export declare function watchTrades(dataApi?: MarketDataApi | null): Promise<any[]>;
export declare function getActiveTrades(): Promise<any[]>;
