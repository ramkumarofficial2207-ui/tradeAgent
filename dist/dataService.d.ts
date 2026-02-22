import { Candle, GttOrderRequest, GttOrderResponse, TradingApi } from './types';
export declare const NSE_UNIVERSE: Record<string, string>;
export declare const SECTOR_MAP: Record<string, string>;
export declare const MARKET_CAP_CR_MAP: Record<string, number>;
export declare function fetchHistoricalData(yahooTicker: string, days?: number): Promise<Candle[]>;
export declare function fetchLtp(yahooTicker: string): Promise<number>;
export declare function fetchNiftyData(): Promise<{
    niftyChange: number;
    vixChange: number;
}>;
type BrokerProvider = 'paper' | 'kite';
export declare class KiteLiveTradingApi implements TradingApi {
    private readonly baseUrl;
    private readonly apiKey;
    private readonly accessToken;
    private instrumentMap;
    private lastMapFetchMs;
    constructor(apiKey: string, accessToken: string);
    private loadInstruments;
    private getInstrumentToken;
    getLtp(ticker: string): Promise<number>;
    getHistoricalData(ticker: string, interval: '1d', days?: number): Promise<Candle[]>;
    placeGttOrder(order: GttOrderRequest): Promise<GttOrderResponse>;
}
export declare class GrowwPaperTradingApi implements TradingApi {
    getLtp(ticker: string): Promise<number>;
    getHistoricalData(ticker: string, _interval: '1d', days?: number): Promise<Candle[]>;
    placeGttOrder(order: GttOrderRequest): Promise<GttOrderResponse>;
}
export declare function getTradingApiFromEnv(): {
    provider: BrokerProvider;
    api: TradingApi;
    live: boolean;
};
export {};
