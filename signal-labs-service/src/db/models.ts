/**
 * db/models.ts
 * Interfaces and Types for Institutional Flows, Bhavcopy, Candidate Pool, and Alerts
 */

export interface RawBulkDealRecord {
  symbol: string;
  clientName: string;
  buySell: 'BUY' | 'SELL';
  quantity: number;
  price: number;
  totalValueCr: number;
  tradeDate: Date;
  remarks?: string;
}

export interface RawBhavcopyRecord {
  symbol: string;
  series: string;
  date: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  last: number;
  prevClose: number;
  totTrdQty: number;
  totTrdVal: number;
  totalTrades: number;
  delivQty: number;
  delivPer: number;
}

export interface ProcessedInstitutionalFlow {
  id?: string;
  symbol: string;
  date: Date;
  clientName: string;
  buySell: 'BUY' | 'SELL';
  quantity: number;
  avgPrice: number;
  totalValueCr: number;
  isHftNoise: boolean;
}

export interface CandidatePoolItem {
  id?: string;
  symbol: string;
  addedAt: Date;
  lastAccumulationDate: Date;
  netInstitutionalQty: number;
  netInstitutionalCr: number;
  deliverySpikeRatio: number;
  deliveryPct: number;
}

export interface TechnicalScanAlert {
  id?: string;
  symbol: string;
  alertDate: Date;
  breakoutPrice: number;
  targetPrice: number;
  stopLossPrice: number;
  technicalScore: number;
  fiiDiiNetQty: number;
  deliverySpikeRatio: number;
  setupType: string;
}
