import { MarketDataApi, MarketStatus, StockIndicators, TradeSetup } from './types';
export declare function checkMarketCondition(): Promise<MarketStatus>;
export declare function runScanner(dataApi?: MarketDataApi | null): Promise<{
    qualified: StockIndicators[];
    marketStatus: MarketStatus;
}>;
export declare function buildTradeSetups(qualified: StockIndicators[]): Promise<TradeSetup[]>;
export declare function runIntradayScanner(dataApi?: MarketDataApi | null): Promise<{
    qualified: StockIndicators[];
    marketStatus: MarketStatus;
    setups: TradeSetup[];
}>;
