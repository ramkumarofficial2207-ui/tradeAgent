export type SubscriptionStatus = 'TRIAL' | 'ACTIVE' | 'FREE' | 'EXPIRED';
export type CapCategory = 'LARGE' | 'MID' | 'SMALL' | 'UNKNOWN';
export type TradeStatus = 'OPEN' | 'CLOSED';
export type ExitReason = 'TARGET' | 'STOP' | 'TRAIL' | 'MANUAL';
export type SignalType = 'BUY' | 'LIGHT BUY' | 'WATCH' | 'REJECT';
export type MarketBias = 'BULLISH' | 'BEARISH' | 'NEUTRAL';
export type MarketRegime = 'BULLISH' | 'BEARISH' | 'NEUTRAL' | 'RISK_OFF';
export type SetupStatus = 'IN_PROGRESS' | 'WON' | 'LOST';
export type ScanSetupStatus = 'TRIGGERED' | 'QUALIFIED' | 'WATCHLIST';
export type SetupType = 'Breakout' | 'Pullback' | 'Squeeze';
export type ZoneStatus = 'IN_ZONE' | 'WAIT' | 'EXTENDED' | 'STOPPED';

export interface User {
  id: string;
  email: string;
  mobileNumber?: string;
  name?: string;
  subscriptionStatus: SubscriptionStatus;
  isAdmin?: boolean;
  subscriptionExpiry?: string;
  telegramChatId?: string;
  notifyBuySignals: boolean;
  notifyEmail: boolean;
  tradingCapital: number;
  maxRiskPct: number;
  maxPositions: number;
  maxSectorConc: number;
  brokerConfig?: BrokerConfig;
}

export interface BrokerConfig {
  isConnectedDhan: boolean;
  isConnectedZerodha: boolean;
}

export interface Trade {
  id: string;
  userId: string;
  ticker: string;
  companyName?: string;
  sector?: string;
  capCategory: CapCategory;
  setupType: string;
  regimeAtEntry?: MarketRegime;
  confidenceScore?: number;
  status: TradeStatus;
  entryDate: string;
  exitDate?: string;
  entryPrice: number;
  quantity: number;
  stopLossInit: number;
  stopLossTrail?: number;
  target1: number;
  target2?: number;
  exitPrice?: number;
  exitReason?: ExitReason;
  currentPrice?: number;
  pnlRs?: number;
  pnlPct?: number;
  rMultiple?: number;
  initialRiskRs?: number;
  capitalDeployed?: number;
  daysHeld?: number;
  notes?: string;
}

export interface WatchlistItem {
  id: string;
  userId: string;
  ticker: string;
  companyName?: string;
  sector?: string;
  signal?: SignalType;
  ltp?: number;
  target?: number;
  stopLoss?: number;
  targetPct?: number;
  slPct?: number;
  riskReward?: number;
  confidenceScore?: number;
  setupType?: string;
  buyZone?: number;
  snapshot?: Record<string, unknown> | null;
  addedAt: string;
}

export interface InstitutionalFlowSnapshot {
  id: string;
  tradingDate: string;
  fiiBuy: number;
  fiiSell: number;
  fiiNet: number;
  diiBuy: number;
  diiSell: number;
  diiNet: number;
  totalNet: number;
  marketBias: MarketBias;
  source: string;
}

export interface HistoricalSetup {
  id: string;
  ticker: string;
  setupType: string;
  timeframe?: string;
  aiSignal: SignalType;
  confidenceScore: number;
  entryPrice: number;
  targetPrice: number;
  stopLoss: number;
  aiLogic?: string;
  status: SetupStatus;
  resultPct?: number;
  createdAt: string;
  resolvedAt?: string;
}

export interface ScanItem {
  id: string;
  ticker: string;
  companyName: string;
  sector: string;
  capCategory: CapCategory;
  setupType: string;
  confidenceScore: number;
  aiSignal?: SignalType;
  status?: ScanSetupStatus;
  newsRisk?: boolean;
  earningsRisk?: boolean;
  ltp: number;
  changePct: number;
  buyZoneMin: number;
  buyZoneMax: number;
  target1: number;
  target1Pct: number;
  target2?: number;
  target2Pct?: number;
  stopLoss: number;
  stopLossPct: number;
  riskReward: number;
  dma200: number;
  ema50: number;
  ema20: number;
  rsi14: number;
  adx14: number;
  volumeRatio: number;
  pctFrom52wHigh: number;
  ichimokuBullish: boolean;
  supertrendBullish: boolean;
  isSqueeze: boolean;
  sparkline: number[];
  aiReasons: string[];
}

export interface LiveIndex {
  symbol: string;
  name: string;
  ltp: number;
  change: number;
  changePct: number;
}

export interface MarketStatus {
  isOpen: boolean;
  session: 'PRE_MARKET' | 'REGULAR' | 'POST_MARKET' | 'CLOSED';
  lastUpdated: string;
  label?: string;
  nextEvent?: string;
}

// Legacy dashboard components consume this normalized presentation model.
export interface Setup {
  id: string;
  ticker: string;
  name: string;
  sector: string;
  price: number;
  change: number;
  confidence: number;
  type: SetupType;
  buyZone: string;
  target1: number;
  target2: number;
  stopLoss: number;
  rr: string;
  sparkline: number[];
  reasons: string[];
  bullCase: string;
  bearCase: string;
  mlWinProbability?: number | string;
  mlAction?: string;
}

export interface IndexData {
  name: string;
  val: string;
  chg: string;
  up: boolean;
}

export interface Holding {
  ticker: string;
  qty: number;
  cost: number;
  ltp: number;
  pnl: number;
  pct: number;
}

export interface FlowEntry {
  day: string;
  fii: number;
  dii: number;
}

export interface BreadthMetric {
  label: string;
  val: string;
  status: string;
  color: string;
}

export interface RiskPlan {
  qty: number;
  cost: number;
  maxLoss: number;
  profitT1: number;
  profitT2: number;
}
