export interface User {
  id: string;
  name: string | null;
  email: string;
  mobileNumber?: string | null;
  createdAt: string;
  subscriptionStatus?: 'TRIAL' | 'ACTIVE' | 'FREE' | 'EXPIRED';
  subscriptionExpiry?: string | null;
}

export interface WatchlistItem {
  id?: string;
  ticker: string;
  sector?: string;
  signal?: 'BUY' | 'LIGHT BUY' | 'WATCH' | 'REJECT';
  ltp?: number;
  target?: number;
  stopLoss?: number;
  targetPct?: number;
  slPct?: number;
  riskReward?: number;
  confidenceScore?: number;
  setupType?: string;
  buyZone?: number;
  snapshot?: Record<string, unknown>;
  addedAt?: string;
}

export interface TradeSetup {
  ticker: string;
  sector: string;
  setupType: string;
  ltp: number;
  buyZone: number;
  target: number;
  stopLoss: number;
  targetPct: number;
  slPct: number;
  riskReward: number;
  confidenceScore: number;
  aiSignal?: 'BUY' | 'LIGHT BUY' | 'WATCH' | 'REJECT';
  aiLogic?: string;
  catalyst?: string;
}

export interface AgentEvent {
  id: string;
  type: string;
  severity: 'info' | 'success' | 'warning' | 'critical';
  title: string;
  detail: string;
  ticker?: string;
  timestamp: string;
  read: boolean;
}

export interface ThinkingStep {
  id: string;
  step: string;
  status: 'pending' | 'running' | 'done' | 'error';
  detail?: string;
  timestamp: string;
}

export interface AgentStatus {
  state: 'IDLE' | 'SCANNING' | 'ANALYZING' | 'MONITORING' | 'ALERTING';
  currentTask: string | null;
  tasksCompleted: number;
  uptime: string;
  lastScanAt: string | null;
  nextScanAt: string | null;
  monitoredStocks: number;
  activeAlerts: number;
  thinkingSteps: ThinkingStep[];
}

export interface PortfolioTrade {
  id: string;
  ticker: string;
  companyName?: string | null;
  sector?: string | null;
  status: 'OPEN' | 'CLOSED';
  entryPrice: number;
  currentPrice?: number | null;
  quantity: number;
  stopLossInit: number;
  target1: number;
  target2?: number | null;
  exitPrice?: number | null;
  exitReason?: string | null;
  pnlRs?: number | null;
  pnlPct?: number | null;
  notes?: string | null;
  entryDate: string;
  exitDate?: string | null;
}

export interface PortfolioSummary {
  totalTrades?: number;
  openTrades?: number;
  closedTrades?: number;
  winRate?: number;
  capitalDeployed?: number;
  realizedPnlRs?: number;
  unrealizedPnlRs?: number;
}

export interface MarketPulseIndex {
  price: number;
  change: number;
}

export interface MarketPulse {
  indices: Record<string, MarketPulseIndex>;
  vixLabel: {
    text: string;
    color: string;
    detail: string;
  };
  isMarketOpen: boolean;
  fetchedAt: string;
}

export interface SectorTile {
  n: string;
  v: number;
}

export interface SectorPulse {
  sectors: SectorTile[];
  fetchedAt: string;
  source: string;
}

export interface FiiDiiSummary {
  latest: {
    fiiNet: number;
    diiNet: number;
    totalNet: number;
    tradingDate: string;
  } | null;
  totals: {
    totalNet1dCr: number;
    totalNet5dCr: number;
    totalNet20dCr: number;
  };
  trend: {
    bias: 'RISK_ON' | 'RISK_OFF' | 'MIXED';
    detail: string;
    score: number;
  };
}

export interface ChartPoint {
  time: string | number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  sma20?: number | null;
  sma50?: number | null;
  sma200?: number | null;
  rsi?: number | null;
}
