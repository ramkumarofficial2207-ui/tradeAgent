import type {
  HistoricalSetup,
  InstitutionalFlowSnapshot,
  LiveIndex,
  MarketStatus,
  ScanItem,
  Trade,
  User,
  WatchlistItem,
} from '../types';

// Empty, non-financial bootstrap values. Real values must come from authenticated APIs.
export const INITIAL_USER: User = {
  id: '',
  email: '',
  name: '',
  subscriptionStatus: 'FREE',
  notifyBuySignals: false,
  notifyEmail: false,
  tradingCapital: 0,
  maxRiskPct: 0,
  maxPositions: 0,
  maxSectorConc: 0,
  brokerConfig: {
    isConnectedDhan: false,
    isConnectedZerodha: false,
  },
};

export const LIVE_INDICES: LiveIndex[] = [];

export const MARKET_STATUS: MarketStatus = {
  isOpen: false,
  session: 'CLOSED',
  lastUpdated: '',
};

export const INITIAL_FLOW: InstitutionalFlowSnapshot = {
  id: '',
  tradingDate: '',
  fiiBuy: 0,
  fiiSell: 0,
  fiiNet: 0,
  diiBuy: 0,
  diiSell: 0,
  diiNet: 0,
  totalNet: 0,
  marketBias: 'NEUTRAL',
  source: 'unavailable',
};

export const INITIAL_SCAN_ITEMS: ScanItem[] = [];
export const INITIAL_TRADES: Trade[] = [];
export const INITIAL_WATCHLIST: WatchlistItem[] = [];
export const HISTORICAL_SETUPS: HistoricalSetup[] = [];


