import React, { useState, useEffect } from 'react';
import { 
  Bot, 
  Search, 
  Sparkles, 
  TrendingUp, 
  TrendingDown, 
  Activity, 
  Layers, 
  Zap, 
  Building2, 
  ShieldCheck, 
  Filter, 
  ArrowUpRight, 
  ArrowDownRight,
  Calculator,
  Send,
  Loader2,
  Check,
  AlertCircle,
  Calendar,
  ChevronLeft,
  ChevronRight,
  RotateCcw
} from 'lucide-react';
import { ScanItem, User } from '../types';
import { 
  BulkDealItem, 
  DailyFlow, 
  InstitutionalConfluenceRecord,
  MarketRegimeData,
  buildQualifiedConfluenceSignals,
  INITIAL_BULK_DEALS,
  INITIAL_DAILY_FLOWS,
  INITIAL_REGIME_DATA
} from '../data/institutionalData';
import { apiJson } from '../lib/api';

// Safe Number helper to prevent runtime crash on undefined/null
const num = (val: any, fallback = 0): number => {
  if (typeof val === 'number' && !isNaN(val)) return val;
  const parsed = parseFloat(val);
  return isNaN(parsed) ? fallback : parsed;
};

const INR = '\u20B9';

interface DatasetMeta {
  source: string;
  asOf: string;
  isStale: boolean;
  note: string;
}

const EMPTY_META: DatasetMeta = { source: 'Unavailable', asOf: '', isStale: true, note: '' };

interface SignalLabsPageProps {
  scanItems?: ScanItem[];
  user?: User;
  onOpenDeepAnalysis?: (item: ScanItem) => void;
}

export const SignalLabsPage: React.FC<SignalLabsPageProps> = ({ 
  scanItems = [], 
  user = {} as User,
  onOpenDeepAnalysis
}) => {
  const safeScanItems = Array.isArray(scanItems) ? scanItems : [];
  
  // State for Deals & Confluence Radar
  const [deals, setDeals] = useState<BulkDealItem[]>(INITIAL_BULK_DEALS);
  const [confluenceRecords, setConfluenceRecords] = useState<InstitutionalConfluenceRecord[]>([]);
  const [dailyFlows, setDailyFlows] = useState<DailyFlow[]>(INITIAL_DAILY_FLOWS);
  const [regime, setRegime] = useState<MarketRegimeData>(INITIAL_REGIME_DATA);
  const [scanTimestamp, setScanTimestamp] = useState<string>('');
  const [flowMeta, setFlowMeta] = useState<DatasetMeta>(EMPTY_META);
  const [dealMeta, setDealMeta] = useState<DatasetMeta>(EMPTY_META);
  const [loadingData, setLoadingData] = useState<boolean>(true);
  const [sectionErrors, setSectionErrors] = useState<string[]>([]);
  
  // Filters State
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedEntity, setSelectedEntity] = useState<string>('ALL');
  const [selectedTradeType, setSelectedTradeType] = useState<string>('ALL');
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const ITEMS_PER_PAGE = 15;

  // Deals view: row-level feed or stock-aggregated summary
  const [dealsView, setDealsView] = useState<'all' | 'summary'>('summary');

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedEntity, selectedTradeType, fromDate, toDate, dealsView]);

  // Active view tab (Overview & Radar / AI Assistant & Risk Lab)
  const [activeTab, setActiveTab] = useState<'radar' | 'assistant'>('radar');

  // Multi-LLM Chat State
  const [selectedTicker, setSelectedTicker] = useState<string>(safeScanItems[0]?.ticker || '');
  const [chatMessages, setChatMessages] = useState<Array<{ sender: 'user' | 'ai'; text: string; time: string }>>([
    {
      sender: 'ai',
      text: `Welcome to Signal Labs Quantitative Desk! I am APEX Intelligence, your grounded smart money analyst. Ask me about institutional bulk deal entries, FII/DII net flows, or risk governor parameters.`,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);
  const [userInput, setUserInput] = useState<string>('');
  const [chatLoading, setChatLoading] = useState<boolean>(false);

  // Position Calculator State
  const activeItem = safeScanItems.find((s) => s.ticker === selectedTicker) || safeScanItems[0];
  const [calcCapital, setCalcCapital] = useState<number>(user?.tradingCapital || 0);
  const [calcRiskPct, setCalcRiskPct] = useState<number>(user?.maxRiskPct || 0);
  const [calcEntryPrice, setCalcEntryPrice] = useState<number>(activeItem?.ltp || 0);
  const [calcStopLoss, setCalcStopLoss] = useState<number>(activeItem?.stopLoss || 0);

  const allowedRiskRs = (num(calcCapital) * num(calcRiskPct)) / 100;
  const riskPerShare = Math.max(num(calcEntryPrice) - num(calcStopLoss), 0);
  const calculatedShares = riskPerShare > 0 ? Math.floor(allowedRiskRs / riskPerShare) : 0;
  const totalCapitalDeployed = calculatedShares * num(calcEntryPrice);
  const maxLossRs = calculatedShares * riskPerShare;

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;

    const refreshSignalLabs = async () => {
      const [dealsResult, confluenceResult, flowsResult, marketResult, scanResult] = await Promise.allSettled([
        apiJson<any>('/api/institutional/deals?days=730'),
        apiJson<any>('/api/institutional/confluence'),
        apiJson<any>('/api/fii-dii'),
        apiJson<any>('/api/live/market'),
        apiJson<any>('/api/last'),
      ]);
      if (cancelled) return;

      const errors: string[] = [];

      if (dealsResult.status === 'fulfilled') {
        const rawDeals = Array.isArray(dealsResult.value?.data) ? dealsResult.value.data : [];
        setDeals(rawDeals.map((deal: any, idx: number) => ({
          id: deal.id || `${deal.symbol}-${deal.tradeDate}-${idx}`,
          symbol: deal.symbol || 'UNKNOWN',
          clientName: deal.clientName || 'Unspecified entity',
          entity: (deal.entityType || 'OTHER') as BulkDealItem['entity'],
          dealType: (deal.dealType || 'BUY') as BulkDealItem['dealType'],
          quantity: num(deal.quantity),
          price: num(deal.price),
          totalValueCr: num(deal.totalValue),
          tradeDate: deal.tradeDate || '',
          exchange: 'NSE',
        })));
        setDealMeta({
          source: dealsResult.value?.meta?.source || 'NSE Daily Bulk Deals Archive',
          asOf: dealsResult.value?.meta?.lastTradeDate || '',
          isStale: false,
          note: 'Entity labels are rule-based classifications of disclosed participant names.',
        });
      } else {
        errors.push('Bulk-deal feed');
      }

      if (confluenceResult.status === 'fulfilled') {
        setConfluenceRecords(Array.isArray(confluenceResult.value?.data) ? confluenceResult.value.data : []);
      } else {
        errors.push('Institutional confluence');
      }

      if (flowsResult.status === 'fulfilled') {
        const flowSummary = flowsResult.value?.data;
        const flowSeries = Array.isArray(flowSummary?.series) ? flowSummary.series : [];
        setDailyFlows(flowSeries.slice(0, 10).reverse().map((flow: any) => ({
          date: flow.tradingDate,
          fiiNetCr: num(flow.fiiNet),
          diiNetCr: num(flow.diiNet),
          totalNetCr: num(flow.totalNet),
        })));
        setFlowMeta({
          source: flowSummary?.source || 'NSE Official FII/FPI & DII Report',
          asOf: flowSummary?.lastTradingDate || '',
          isStale: Boolean(flowSummary?.isStale),
          note: flowSummary?.note || 'Official provisional end-of-day cash-market activity.',
        });
      } else {
        errors.push('FII/DII history');
      }

      const marketPayload = marketResult.status === 'fulfilled' ? marketResult.value?.data : null;
      const scanPayload = scanResult.status === 'fulfilled' ? scanResult.value?.data : null;
      const indices = marketPayload?.indices;
      const liveStatus = marketPayload?.marketStatus;
      const scannerMarket = scanPayload?.marketStatus;
      const completedScanAt = scanPayload?.timestamp || '';
      const scanAgeMs = completedScanAt ? Date.now() - new Date(completedScanAt).getTime() : Number.POSITIVE_INFINITY;
      const scanIsStale = liveStatus?.isOpen ? scanAgeMs > 75 * 60 * 1000 : scanAgeMs > 96 * 60 * 60 * 1000;
      setScanTimestamp(completedScanAt);
      setRegime({
        regime: ['BULLISH', 'NEUTRAL', 'RISK_OFF'].includes(scannerMarket?.regime) ? scannerMarket.regime : 'UNAVAILABLE',
        positionSizingMultiplier: Number.isFinite(Number(scannerMarket?.positionSizeMult))
          ? `${Number(scannerMarket.positionSizeMult).toFixed(2)}x`
          : 'Unavailable',
        dmaCrossPct: Number.isFinite(Number(scannerMarket?.dmaCrossPct)) ? Number(scannerMarket.dmaCrossPct) : null,
        detail: scannerMarket?.regimeDetail || 'No completed market scan is available.',
        niftyValue: num(indices?.nifty),
        bankNiftyValue: num(indices?.bankNifty),
        sensexValue: num(indices?.sensex),
        activeSignalsCount: Array.isArray(scanPayload?.setups) ? scanPayload.setups.length : 0,
        vixValue: num(indices?.indiaVix || scannerMarket?.vixLevel),
        lastUpdated: indices?.fetchedAt || '',
        scanTimestamp: completedScanAt,
        scanIsStale,
        marketIsOpen: Boolean(liveStatus?.isOpen),
        marketLabel: liveStatus?.label || 'Unavailable',
        nextMarketEvent: liveStatus?.nextEvent || '',
        indexSource: indices?.source || 'unavailable',
      });
      if (marketResult.status === 'rejected') errors.push('Market indices');
      if (scanResult.status === 'rejected') errors.push('Market regime');

      setSectionErrors(errors);
      setLoadingData(false);
      timer = window.setTimeout(refreshSignalLabs, liveStatus?.isOpen ? 60_000 : 300_000);
    };

    void refreshSignalLabs();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, []);

  // Handle AI Chat
  const handleSendQuery = async (queryText?: string) => {
    const q = queryText || userInput;
    if (!q.trim()) return;

    const userMsg = {
      sender: 'user' as const,
      text: q,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setChatMessages((prev) => [...prev, userMsg]);
    if (!queryText) setUserInput('');
    setChatLoading(true);

    try {
      const data = await apiJson<any>('/api/chat/signal-labs', {
        method: 'POST',
        body: JSON.stringify({
          prompt: q,
          model: 'gemini',
        }),
      });

      const replyText = data.data?.response;
      if (!replyText) throw new Error('AI response is unavailable.');

      setChatMessages((prev) => [
        ...prev,
        {
          sender: 'ai',
          text: replyText,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } catch (err) {
      setChatMessages((prev) => [
        ...prev,
        {
          sender: 'ai',
          text: 'Error communicating with Gemini AI signal server.',
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  const safeDealsList = Array.isArray(deals) ? deals : [];
  const filteredDeals = safeDealsList.filter((deal) => {
    if (!deal) return false;
    const matchesEntity = selectedEntity === 'ALL' || deal.entity === selectedEntity;
    const matchesTrade = selectedTradeType === 'ALL' || deal.dealType === selectedTradeType;
    const sym = (deal.symbol || '').toLowerCase();
    const client = (deal.clientName || '').toLowerCase();
    const q = searchQuery.toLowerCase();
    const matchesQuery = !q || sym.includes(q) || client.includes(q);

    let matchesDate = true;
    if (deal.tradeDate) {
      const dStr = deal.tradeDate.split('T')[0];
      if (fromDate && dStr < fromDate) matchesDate = false;
      if (toDate && dStr > toDate) matchesDate = false;
    }

    return matchesEntity && matchesTrade && matchesQuery && matchesDate;
  });

  const safeConfluenceList = buildQualifiedConfluenceSignals(
    Array.isArray(confluenceRecords) ? confluenceRecords : [],
    safeScanItems,
    scanTimestamp,
  );
  const safeDailyFlows = Array.isArray(dailyFlows) ? dailyFlows : [];
  const safeRegime = regime || INITIAL_REGIME_DATA;
  const formatIndexValue = (value: number) => value > 0 ? `${INR}${value.toLocaleString('en-IN')}` : 'Unavailable';
  const formatAsOf = (value: string) => value
    ? new Date(value).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
    : 'Unavailable';
  const latestFlow = safeDailyFlows[safeDailyFlows.length - 1];
  const flowScale = Math.max(1, ...safeDailyFlows.flatMap((flow) => [Math.abs(num(flow.fiiNetCr)), Math.abs(num(flow.diiNetCr))]));
  const vixRisk = safeRegime.vixValue <= 0 ? 'Unavailable' : safeRegime.vixValue > 20 ? 'High Risk' : safeRegime.vixValue > 16 ? 'Moderate Risk' : 'Low Risk';
  const indexBadge = safeRegime.marketIsOpen && !safeRegime.indexSource.includes('cached')
    ? 'Market open'
    : 'Latest close';

  return (
    <div className="space-y-6 text-gray-200">
      
      {/* 1. Header Bar */}
      <div className="bg-[#0D111A]/80 backdrop-blur-xl border border-white/10 rounded-2xl p-5 sm:p-6 shadow-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-indigo-500/20 to-violet-500/20 border border-indigo-500/40 text-indigo-400 shadow-lg shadow-indigo-500/10">
              <Bot className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-white tracking-tight font-sans">Signal Labs Desk</h1>
              <p className="text-xs text-gray-400 mt-0.5">
                Quantitative breadth metrics, Smart Money institutional flows, and Bulk Deal tracking
              </p>
            </div>
          </div>
        </div>

        {/* Top Right Actions & Navigation */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Section Toggle */}
          <div className="flex items-center gap-1 bg-[#080B10] p-1 rounded-xl border border-white/10 text-xs font-bold">
            <button
              onClick={() => setActiveTab('radar')}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                activeTab === 'radar'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <span className="inline-flex items-center gap-1.5"><Building2 className="w-3.5 h-3.5" /> Radar & Deals</span>
            </button>
            <button
              onClick={() => setActiveTab('assistant')}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                activeTab === 'assistant'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <span className="inline-flex items-center gap-1.5"><Zap className="w-3.5 h-3.5" /> AI Assistant & Calculator</span>
            </button>
          </div>
        </div>
      </div>

      {loadingData && (
        <div className="flex items-center gap-2 rounded-xl border border-indigo-500/20 bg-indigo-500/10 px-4 py-3 text-xs text-indigo-200">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading sourced Signal Labs data...
        </div>
      )}
      {!loadingData && sectionErrors.length > 0 && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-100">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Some datasets are temporarily unavailable: {sectionErrors.join(', ')}. Available sections remain usable.</span>
        </div>
      )}

      {/* 2. Macro Breadth Metric Cards Grid (4 Cards) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Nifty 50 */}
        <div className="bg-[#0D111A]/80 backdrop-blur-xl border border-white/10 hover:border-emerald-500/40 rounded-2xl p-4 shadow-xl transition-all duration-200 group">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-gray-400 font-sans">Nifty 50 Index</span>
            <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              {indexBadge}
            </span>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-xl font-black text-white font-mono tracking-tight">{formatIndexValue(safeRegime.niftyValue)}</span>
          </div>
          <p className="text-[10px] text-gray-500 mt-1 font-mono">{safeRegime.indexSource} · {formatAsOf(safeRegime.lastUpdated)}</p>
        </div>

        {/* Card 2: Bank Nifty */}
        <div className="bg-[#0D111A]/80 backdrop-blur-xl border border-white/10 hover:border-indigo-500/40 rounded-2xl p-4 shadow-xl transition-all duration-200 group">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-gray-400 font-sans">Bank Nifty</span>
            <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              {indexBadge}
            </span>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-xl font-black text-white font-mono tracking-tight">{formatIndexValue(safeRegime.bankNiftyValue)}</span>
          </div>
          <p className="text-[10px] text-gray-500 mt-1 font-mono">{safeRegime.indexSource} · {formatAsOf(safeRegime.lastUpdated)}</p>
        </div>

        {/* Card 3: Sensex 30 */}
        <div className="bg-[#0D111A]/80 backdrop-blur-xl border border-white/10 hover:border-amber-500/40 rounded-2xl p-4 shadow-xl transition-all duration-200 group">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-gray-400 font-sans">Sensex 30</span>
            <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-amber-500/10 text-amber-400 border border-amber-500/20">
              {indexBadge}
            </span>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-xl font-black text-white font-mono tracking-tight">{formatIndexValue(safeRegime.sensexValue)}</span>
          </div>
          <p className="text-[10px] text-gray-500 mt-1 font-mono">{safeRegime.indexSource} · {formatAsOf(safeRegime.lastUpdated)}</p>
        </div>

        {/* Card 4: Active Signals */}
        <div className="bg-[#0D111A]/80 backdrop-blur-xl border border-white/10 hover:border-cyan-500/40 rounded-2xl p-4 shadow-xl transition-all duration-200 group">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-gray-400 font-sans">Active Signals</span>
            <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
              Qualified Setups
            </span>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-xl font-black text-white font-mono tracking-tight">{safeScanItems.length || safeConfluenceList.length}</span>
            <span className="text-xs font-bold text-cyan-400 font-mono flex items-center gap-1">
              <Zap className="w-3.5 h-3.5 fill-cyan-400" />
              Current Setups
            </span>
          </div>
          <p className="text-[10px] text-gray-500 mt-1 font-mono">Latest completed market scan</p>
        </div>
      </div>

      {activeTab === 'radar' ? (
        <>
          {/* 3. Institutional Confluence Radar */}
          <div className="bg-[#0D111A]/80 backdrop-blur-xl border border-white/10 rounded-2xl p-5 sm:p-6 shadow-2xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-4">
              <div>
                <h2 className="text-lg font-black text-white flex items-center gap-2">
                  <Activity className="h-5 w-5 text-cyan-400" />
                  <span>Institutional Confluence Radar</span>
                </h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  Recent positive classified bulk-deal flow matched with a current scanner BUY setup
                </p>
              </div>

              <span className="px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-mono text-xs font-bold flex items-center gap-1.5 self-start sm:self-auto">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                {safeConfluenceList.length} Qualified Candidates
              </span>
            </div>

            {/* Radar Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {safeConfluenceList.map((signal) => {
                const scanMatch = safeScanItems.find(s => s.ticker === signal.symbol);

                return (
                  <div
                    key={signal.symbol}
                    onClick={() => {
                      if (scanMatch && onOpenDeepAnalysis) {
                        onOpenDeepAnalysis(scanMatch);
                      }
                    }}
                    className="p-4 rounded-xl bg-[#080B10] border border-white/10 hover:border-cyan-500/40 transition-all duration-200 flex flex-col justify-between gap-3 shadow-lg group cursor-pointer"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="text-base font-black text-white font-mono group-hover:text-cyan-400 transition-colors">
                          {signal.symbol}
                        </h3>
                        <span className="px-2 py-0.5 rounded text-[10px] font-black font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                          {Number.isFinite(Number(signal.confluenceScore)) ? `${Number(signal.confluenceScore)}/100` : 'Unavailable'}
                        </span>
                      </div>

                      <p className="text-[11px] text-gray-400 mt-0.5 font-sans truncate">{signal.companyName}</p>

                      <div className="mt-2.5 space-y-1 text-xs font-mono">
                        <div className="flex justify-between">
                          <span className="text-gray-400">FII-classified net:</span>
                          <span className="text-emerald-400 font-bold">{INR}{num(signal.fiiNetInflowCr).toFixed(2)} Cr</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-400">DII-classified net:</span>
                          <span className="text-indigo-400 font-bold">{INR}{num(signal.diiNetInflowCr).toFixed(2)} Cr</span>
                        </div>
                        <div className="flex justify-between pt-1 border-t border-white/5">
                          <span className="text-gray-300 font-bold">Total Smart Flow:</span>
                          <span className="text-cyan-300 font-extrabold">{INR}{num(signal.totalInflowCr).toFixed(2)} Cr</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-white/5">
                      <span className="px-2 py-0.5 rounded text-[9px] font-extrabold uppercase bg-indigo-950 text-indigo-300 border border-indigo-500/30">
                        {signal.setupType}
                      </span>
                      <span className="text-[11px] font-mono text-gray-400">
                        {num(signal.ltp) > 0 ? `${INR}${num(signal.ltp).toFixed(2)}` : 'Price unavailable'}
                      </span>
                    </div>
                    <p className="text-[9px] text-gray-500 font-mono">
                      Deal {new Date(signal.institutionalTradeDate).toLocaleDateString('en-IN')} · Scan confidence {signal.scannerConfidence.toFixed(1)}/10
                    </p>
                  </div>
                );
              })}
              {!loadingData && safeConfluenceList.length === 0 && (
                <div className="md:col-span-2 lg:col-span-4 rounded-xl border border-white/10 bg-[#080B10] p-6 text-center">
                  <p className="text-sm font-bold text-gray-300">No qualified institutional + technical match is active.</p>
                  <p className="mt-1 text-xs text-gray-500">
                    This is a valid result. Macro FII/DII totals cannot identify individual stocks, so the radar does not manufacture candidates.
                  </p>
                </div>
              )}
            </div>
            <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 px-3 py-2 text-[10px] text-cyan-100">
              Candidate rule: positive stock-level classified bulk-deal accumulation + scanner BUY/LIGHT BUY + confidence at least 7/10. This is research context, not a recommendation.
            </div>
          </div>

          {/* 4. Stock-Wise Institutional Bulk & Block Deals Feed */}
          <div className="bg-[#0D111A]/80 backdrop-blur-xl border border-white/10 rounded-2xl p-5 sm:p-6 shadow-2xl space-y-5">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-white/10 pb-4">
              <div>
                <h2 className="text-lg font-black text-white flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-indigo-400" />
                  <span>Institutional Bulk Deals</span>
                </h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  Official NSE disclosures — {dealsView === 'summary' ? 'stocks grouped by net institutional activity' : 'individual deal rows per institution'}
                </p>
                <p className="mt-1 text-[10px] text-gray-500 font-mono">
                  Source: {dealMeta.source} · Latest trade date: {formatAsOf(dealMeta.asOf)}
                </p>
              </div>

              {/* Controls: View Toggle + Search + Date Range + Entity Filters */}
              <div className="flex flex-col sm:flex-row flex-wrap items-start sm:items-center gap-2">

                {/* View Toggle */}
                <div className="flex items-center gap-1 bg-[#080B10] p-1 rounded-xl border border-white/10 text-[11px] font-bold">
                  <button
                    onClick={() => setDealsView('summary')}
                    className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                      dealsView === 'summary'
                        ? 'bg-gradient-to-r from-emerald-600 to-indigo-600 text-white shadow-md'
                        : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    <Layers className="w-3 h-3" /> Stock Summary
                  </button>
                  <button
                    onClick={() => setDealsView('all')}
                    className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                      dealsView === 'all'
                        ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                        : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    <Filter className="w-3 h-3" /> All Deals
                  </button>
                </div>

                {/* Search Input */}
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Filter by Symbol..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-8 pr-3 py-1.5 bg-[#080B10] border border-white/10 rounded-xl text-xs text-white placeholder-gray-500 focus:border-indigo-500 outline-none w-36"
                  />
                </div>

                {/* Date Range Calendar Filter */}
                <div className="flex items-center gap-1 bg-[#080B10] p-1 rounded-xl border border-white/10 text-xs">
                  <Calendar className="w-3.5 h-3.5 text-indigo-400 shrink-0 ml-1" />
                  <input
                    type="date"
                    value={fromDate}
                    onChange={(e) => setFromDate(e.target.value)}
                    title="From Trade Date"
                    className="bg-black/50 border border-white/10 rounded-lg px-2 py-1 text-[11px] text-white focus:border-indigo-500 outline-none font-mono"
                  />
                  <span className="text-gray-500 text-[10px]">to</span>
                  <input
                    type="date"
                    value={toDate}
                    onChange={(e) => setToDate(e.target.value)}
                    title="To Trade Date"
                    className="bg-black/50 border border-white/10 rounded-lg px-2 py-1 text-[11px] text-white focus:border-indigo-500 outline-none font-mono"
                  />
                  {(fromDate || toDate) && (
                    <button
                      onClick={() => { setFromDate(''); setToDate(''); }}
                      title="Clear Date Filter"
                      className="px-2 py-1 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-all text-[10px] font-bold flex items-center gap-1"
                    >
                      <RotateCcw className="w-3 h-3" /> Clear
                    </button>
                  )}
                </div>

                {/* Entity Filter Pills */}
                <div className="flex items-center gap-1 bg-[#080B10] p-1 rounded-xl border border-white/10 text-[11px] font-bold overflow-x-auto no-scrollbar">
                  {['ALL', 'FII', 'DII', 'PROMOTER', 'HNI', 'ARBITRAGE'].map((ent) => (
                    <button
                      key={ent}
                      onClick={() => setSelectedEntity(ent)}
                      className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                        selectedEntity === ent
                          ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                          : 'text-gray-400 hover:text-white'
                      }`}
                    >
                      {ent}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* ── STOCK SUMMARY VIEW ─────────────────────────────────────────── */}
            {dealsView === 'summary' ? (() => {
              // Aggregate filteredDeals by symbol
              const stockMap = new Map<string, {
                symbol: string;
                buyQty: number; buyValueCr: number;
                sellQty: number; sellValueCr: number;
                entities: Set<string>;
                latestDate: string;
              }>();

              filteredDeals.forEach((deal) => {
                const sym = deal.symbol || 'UNKNOWN';
                if (!stockMap.has(sym)) {
                  stockMap.set(sym, { symbol: sym, buyQty: 0, buyValueCr: 0, sellQty: 0, sellValueCr: 0, entities: new Set(), latestDate: deal.tradeDate || '' });
                }
                const entry = stockMap.get(sym)!;
                if (deal.dealType === 'BUY') {
                  entry.buyQty += num(deal.quantity);
                  entry.buyValueCr += num(deal.totalValueCr);
                } else {
                  entry.sellQty += num(deal.quantity);
                  entry.sellValueCr += num(deal.totalValueCr);
                }
                if (deal.entity) entry.entities.add(deal.entity);
                if (deal.tradeDate && deal.tradeDate > entry.latestDate) entry.latestDate = deal.tradeDate;
              });

              const stockList = Array.from(stockMap.values()).map((s) => ({
                ...s,
                netFlowCr: s.buyValueCr - s.sellValueCr,
                entitiesArr: Array.from(s.entities),
              })).sort((a, b) => Math.abs(b.netFlowCr) - Math.abs(a.netFlowCr));

              const totalStockPages = Math.max(1, Math.ceil(stockList.length / ITEMS_PER_PAGE));
              const paginatedStockList = stockList.slice(
                (currentPage - 1) * ITEMS_PER_PAGE,
                currentPage * ITEMS_PER_PAGE
              );

              const bought = paginatedStockList.filter((s) => s.netFlowCr > 0);
              const sold = paginatedStockList.filter((s) => s.netFlowCr <= 0);
              const maxFlow = Math.max(1, ...stockList.map((s) => Math.abs(s.netFlowCr)));

              const entityBadge = (entity: string) => {
                const cls =
                  entity === 'FII' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' :
                  entity === 'DII' ? 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30' :
                  entity === 'PROMOTER' ? 'bg-amber-500/20 text-amber-300 border-amber-500/30' :
                  entity === 'HNI' ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30' :
                  'bg-gray-500/20 text-gray-300 border-gray-500/30';
                return (
                  <span key={entity} className={`px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase border ${cls}`}>
                    {entity}
                  </span>
                );
              };

              const StockCard = ({ s, isBuy }: { s: typeof stockList[0]; isBuy: boolean }) => {
                const barPct = Math.min((Math.abs(s.netFlowCr) / maxFlow) * 100, 100);
                return (
                  <div className={`p-4 rounded-xl border transition-all duration-200 bg-[#080B10] ${
                    isBuy ? 'border-emerald-500/20 hover:border-emerald-500/40' : 'border-red-500/20 hover:border-red-500/40'
                  }`}>
                    {/* Header Row */}
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div>
                        <span className="text-sm font-black text-white font-mono">{s.symbol}</span>
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {s.entitiesArr.map(entityBadge)}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <span className={`text-sm font-black font-mono ${
                          isBuy ? 'text-emerald-400' : 'text-red-400'
                        }`}>
                          {isBuy ? '+' : '-'}{INR}{Math.abs(s.netFlowCr).toFixed(2)} Cr
                        </span>
                        <p className="text-[9px] text-gray-500 mt-0.5 font-mono">
                          {s.latestDate ? new Date(s.latestDate).toLocaleDateString('en-IN') : ''}
                        </p>
                      </div>
                    </div>

                    {/* Net Flow Bar */}
                    <div className="mb-3">
                      <div className="w-full bg-white/5 h-1.5 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-700 ${
                            isBuy ? 'bg-gradient-to-r from-emerald-600 to-emerald-400' : 'bg-gradient-to-r from-red-700 to-red-500'
                          }`}
                          style={{ width: `${barPct}%` }}
                        />
                      </div>
                    </div>

                    {/* Buy / Sell breakdown */}
                    <div className="space-y-1.5 text-[11px] font-mono">
                      {s.buyValueCr > 0 && (
                        <div className="flex items-center justify-between">
                          <span className="flex items-center gap-1 text-emerald-400 font-bold">
                            <ArrowUpRight className="w-3 h-3" /> Buy
                          </span>
                          <span className="text-gray-300">
                            {s.buyQty.toLocaleString('en-IN')} shares · {INR}{s.buyValueCr.toFixed(2)} Cr
                          </span>
                        </div>
                      )}
                      {s.sellValueCr > 0 && (
                        <div className="flex items-center justify-between">
                          <span className="flex items-center gap-1 text-red-400 font-bold">
                            <ArrowDownRight className="w-3 h-3" /> Sell
                          </span>
                          <span className="text-gray-300">
                            {s.sellQty.toLocaleString('en-IN')} shares · {INR}{s.sellValueCr.toFixed(2)} Cr
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              };

              if (stockList.length === 0) {
                return (
                  <div className="rounded-xl border border-white/10 bg-[#080B10] p-8 text-center">
                    <p className="text-sm font-bold text-gray-300">
                      {safeDealsList.length === 0
                        ? 'No sourced bulk-deal records are stored yet. The daily NSE sync runs after market close.'
                        : 'No stocks match the selected filters or date range.'}
                    </p>
                  </div>
                );
              }

              return (
                <div className="space-y-6">
                  {/* Stocks Being Bought */}
                  {bought.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <div className="h-px flex-1 bg-emerald-500/20" />
                        <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-extrabold">
                          <TrendingUp className="w-3.5 h-3.5" />
                          Stocks Being BOUGHT — Page {currentPage} of {totalStockPages}
                        </span>
                        <div className="h-px flex-1 bg-emerald-500/20" />
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                        {bought.map((s) => <StockCard key={s.symbol} s={s} isBuy={true} />)}
                      </div>
                    </div>
                  )}

                  {/* Stocks Being Sold */}
                  {sold.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <div className="h-px flex-1 bg-red-500/20" />
                        <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-extrabold">
                          <TrendingDown className="w-3.5 h-3.5" />
                          Stocks Being SOLD — Page {currentPage} of {totalStockPages}
                        </span>
                        <div className="h-px flex-1 bg-red-500/20" />
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                        {sold.map((s) => <StockCard key={s.symbol} s={s} isBuy={false} />)}
                      </div>
                    </div>
                  )}

                  {/* Summary View Pagination Bar */}
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-white/10 text-xs">
                    <div className="text-gray-400 font-mono text-[11px]">
                      Showing <span className="font-bold text-white">{(currentPage - 1) * ITEMS_PER_PAGE + 1}</span> to{' '}
                      <span className="font-bold text-white">{Math.min(currentPage * ITEMS_PER_PAGE, stockList.length)}</span> of{' '}
                      <span className="font-bold text-white">{stockList.length}</span> stocks
                    </div>

                    {totalStockPages > 1 && (
                      <div className="flex items-center gap-1.5">
                        <button
                          disabled={currentPage === 1}
                          onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                          className="px-2.5 py-1.5 rounded-lg bg-[#080B10] border border-white/10 text-gray-300 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex items-center gap-1 text-[11px] font-bold"
                        >
                          <ChevronLeft className="w-3.5 h-3.5" /> Previous
                        </button>
                        <div className="flex items-center gap-1">
                          {Array.from({ length: totalStockPages }, (_, i) => i + 1)
                            .filter((page) => page === 1 || page === totalStockPages || Math.abs(page - currentPage) <= 1)
                            .reduce<(number | string)[]>((acc, page, idx, arr) => {
                              if (idx > 0 && page - (arr[idx - 1] as number) > 1) acc.push('...');
                              acc.push(page);
                              return acc;
                            }, [])
                            .map((p, idx) =>
                              typeof p === 'number' ? (
                                <button
                                  key={p}
                                  onClick={() => setCurrentPage(p)}
                                  className={`w-7 h-7 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                                    currentPage === p
                                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                                      : 'bg-[#080B10] border border-white/10 text-gray-400 hover:text-white'
                                  }`}
                                >
                                  {p}
                                </button>
                              ) : (
                                <span key={`ell-sum-${idx}`} className="px-1 text-gray-500 text-xs font-mono">...</span>
                              )
                            )}
                        </div>
                        <button
                          disabled={currentPage === totalStockPages}
                          onClick={() => setCurrentPage((p) => Math.min(p + 1, totalStockPages))}
                          className="px-2.5 py-1.5 rounded-lg bg-[#080B10] border border-white/10 text-gray-300 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex items-center gap-1 text-[11px] font-bold"
                        >
                          Next <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>

                  <p className="text-[10px] text-gray-600 font-mono text-center">
                    Net flow = total institutional Buy value minus Sell value from NSE bulk deals. Source data: {dealMeta.source}.
                  </p>
                </div>
              );
            })() : (() => {
              const totalTablePages = Math.max(1, Math.ceil(filteredDeals.length / ITEMS_PER_PAGE));
              const paginatedDeals = filteredDeals.slice(
                (currentPage - 1) * ITEMS_PER_PAGE,
                currentPage * ITEMS_PER_PAGE
              );

              return (
                <div className="space-y-4">
                  {/* ── ALL DEALS TABLE VIEW ───────────────────────────────────────── */}
                  <div className="overflow-x-auto rounded-xl border border-white/10">
                    <table className="w-full text-xs text-left font-mono">
                      <thead className="bg-[#080B10] text-gray-400 uppercase text-[10px] tracking-wider border-b border-white/10 font-sans font-bold">
                        <tr>
                          <th className="p-3.5">Symbol</th>
                          <th className="p-3.5">Client / Institution Name</th>
                          <th className="p-3.5">Entity</th>
                          <th className="p-3.5">Trade</th>
                          <th className="p-3.5">Trade Date</th>
                          <th className="p-3.5 text-right">Quantity</th>
                          <th className="p-3.5 text-right">Avg Price</th>
                          <th className="p-3.5 text-right">Total Value</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5 bg-[#0A0E17]">
                        {paginatedDeals.length > 0 ? (
                          paginatedDeals.map((deal) => (
                            <tr key={deal.id} className="hover:bg-white/5 transition-colors">
                              <td className="p-3.5 font-bold text-white font-mono">{deal.symbol}</td>
                              <td className="p-3.5 text-gray-300 font-sans text-[11px] max-w-xs truncate">{deal.clientName}</td>
                              <td className="p-3.5">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase font-mono ${
                                  deal.entity === 'FII'
                                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                    : deal.entity === 'DII'
                                    ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30'
                                    : deal.entity === 'PROMOTER'
                                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                    : deal.entity === 'HNI'
                                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                                    : 'bg-gray-500/20 text-gray-300 border border-gray-500/30'
                                }`}>
                                  {deal.entity}
                                </span>
                              </td>
                              <td className="p-3.5 font-black">
                                <span className={deal.dealType === 'BUY' ? 'text-emerald-400' : 'text-red-400'}>
                                  {deal.dealType}
                                </span>
                              </td>
                              <td className="p-3.5 text-gray-400 font-mono">
                                {deal.tradeDate ? new Date(deal.tradeDate).toLocaleDateString('en-IN') : 'Unavailable'}
                              </td>
                              <td className="p-3.5 text-right text-gray-300 font-mono">
                                {num(deal.quantity).toLocaleString('en-IN')}
                              </td>
                              <td className="p-3.5 text-right text-gray-300 font-mono">
                                {INR}{num(deal.price).toFixed(2)}
                              </td>
                              <td className="p-3.5 text-right text-emerald-400 font-extrabold font-mono">
                                {INR}{num(deal.totalValueCr).toFixed(2)} Cr
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={8} className="p-8 text-center text-gray-500 font-sans text-xs">
                              {safeDealsList.length === 0
                                ? 'No sourced bulk-deal records are stored yet. The daily NSE sync runs after market close.'
                                : 'No bulk deals match the selected filters or date range.'}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* All Deals Table Pagination Bar */}
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-white/10 text-xs">
                    <div className="text-gray-400 font-mono text-[11px]">
                      Showing <span className="font-bold text-white">{filteredDeals.length > 0 ? (currentPage - 1) * ITEMS_PER_PAGE + 1 : 0}</span> to{' '}
                      <span className="font-bold text-white">{Math.min(currentPage * ITEMS_PER_PAGE, filteredDeals.length)}</span> of{' '}
                      <span className="font-bold text-white">{filteredDeals.length.toLocaleString('en-IN')}</span> deal rows
                    </div>

                    {totalTablePages > 1 && (
                      <div className="flex items-center gap-1.5">
                        <button
                          disabled={currentPage === 1}
                          onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                          className="px-2.5 py-1.5 rounded-lg bg-[#080B10] border border-white/10 text-gray-300 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex items-center gap-1 text-[11px] font-bold"
                        >
                          <ChevronLeft className="w-3.5 h-3.5" /> Previous
                        </button>
                        <div className="flex items-center gap-1">
                          {Array.from({ length: totalTablePages }, (_, i) => i + 1)
                            .filter((page) => page === 1 || page === totalTablePages || Math.abs(page - currentPage) <= 1)
                            .reduce<(number | string)[]>((acc, page, idx, arr) => {
                              if (idx > 0 && page - (arr[idx - 1] as number) > 1) acc.push('...');
                              acc.push(page);
                              return acc;
                            }, [])
                            .map((p, idx) =>
                              typeof p === 'number' ? (
                                <button
                                  key={p}
                                  onClick={() => setCurrentPage(p)}
                                  className={`w-7 h-7 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                                    currentPage === p
                                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                                      : 'bg-[#080B10] border border-white/10 text-gray-400 hover:text-white'
                                  }`}
                                >
                                  {p}
                                </button>
                              ) : (
                                <span key={`ell-tbl-${idx}`} className="px-1 text-gray-500 text-xs font-mono">...</span>
                              )
                            )}
                        </div>
                        <button
                          disabled={currentPage === totalTablePages}
                          onClick={() => setCurrentPage((p) => Math.min(p + 1, totalTablePages))}
                          className="px-2.5 py-1.5 rounded-lg bg-[#080B10] border border-white/10 text-gray-300 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex items-center gap-1 text-[11px] font-bold"
                        >
                          Next <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}
          </div>

          {/* 5. Macro Institutional Net Flows & Market Regime Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* 5. Macro Institutional Net Flows (FII vs DII Daily Inflow/Outflow Bars) */}
            <div className="lg:col-span-8 bg-[#0D111A]/80 backdrop-blur-xl border border-white/10 rounded-2xl p-5 sm:p-6 shadow-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <div>
                  <h3 className="text-sm font-extrabold text-white font-sans flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-emerald-400" />
                    Macro Institutional Net Flows (FII vs DII)
                  </h3>
                  <p className="text-[11px] text-gray-400 mt-0.5 font-sans">
                    Official provisional end-of-day cash-market flows across up to 10 stored trading sessions
                  </p>
                  <p className="mt-1 text-[10px] text-gray-500 font-mono">
                    Source: {flowMeta.source} · Latest session: {flowMeta.asOf || 'Unavailable'}
                    {flowMeta.isStale ? ' · Data may be stale' : ''}
                  </p>
                </div>
              </div>

              {/* Bar Comparison Canvas */}
              <div className="space-y-3 pt-2">
                {safeDailyFlows.map((flow) => {
                  const fiiVal = num(flow.fiiNetCr);
                  const diiVal = num(flow.diiNetCr);
                  const totalVal = num(flow.totalNetCr);
                  const fiiWidthPct = Math.min((Math.abs(fiiVal) / flowScale) * 100, 100);
                  const diiWidthPct = Math.min((Math.abs(diiVal) / flowScale) * 100, 100);

                  return (
                    <div key={flow.date} className="p-3 rounded-xl bg-[#080B10] border border-white/5 space-y-2">
                      <div className="flex items-center justify-between text-xs font-mono font-bold">
                        <span className="text-white">{flow.date}</span>
                        <span className="text-cyan-300">Net Total: {totalVal >= 0 ? '+' : ''}{INR}{totalVal.toFixed(1)} Cr</span>
                      </div>

                      {/* FII Bar */}
                      <div className="space-y-1">
                        <div className="flex justify-between text-[10px] font-mono">
                          <span className="text-emerald-400 font-bold">FII Net Flow</span>
                          <span className={fiiVal >= 0 ? 'text-emerald-400 font-bold' : 'text-red-400 font-bold'}>
                            {fiiVal >= 0 ? '+' : ''}{INR}{fiiVal.toFixed(1)} Cr
                          </span>
                        </div>
                        <div className="w-full bg-white/5 h-2 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              fiiVal >= 0 ? 'bg-emerald-500' : 'bg-red-500'
                            }`}
                            style={{ width: `${fiiWidthPct}%` }}
                          />
                        </div>
                      </div>

                      {/* DII Bar */}
                      <div className="space-y-1">
                        <div className="flex justify-between text-[10px] font-mono">
                          <span className="text-indigo-400 font-bold">DII Net Flow</span>
                          <span className={diiVal >= 0 ? 'text-indigo-400 font-bold' : 'text-red-400 font-bold'}>
                            {diiVal >= 0 ? '+' : ''}{INR}{diiVal.toFixed(1)} Cr
                          </span>
                        </div>
                        <div className="w-full bg-white/5 h-2 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              diiVal >= 0 ? 'bg-indigo-500' : 'bg-red-500'
                            }`}
                            style={{ width: `${diiWidthPct}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
                {!loadingData && safeDailyFlows.length === 0 && (
                  <div className="rounded-xl border border-white/10 bg-[#080B10] p-6 text-center text-xs text-gray-500">
                    No official FII/DII session has been stored yet. The service will retain one snapshot after each trading-day close.
                  </div>
                )}
              </div>
            </div>

            {/* 6. Market Regime Engine Gauge */}
            <div className="lg:col-span-4 bg-[#0D111A]/80 backdrop-blur-xl border border-white/10 rounded-2xl p-5 sm:p-6 shadow-2xl flex flex-col justify-between space-y-4">
              <div>
                <h3 className="text-sm font-extrabold text-white font-sans flex items-center gap-2 border-b border-white/10 pb-3">
                  <ShieldCheck className="w-4 h-4 text-cyan-400" />
                  Market Regime Engine
                </h3>

                <div className="mt-4 p-4 rounded-xl bg-gradient-to-br from-indigo-950/60 to-purple-950/40 border border-indigo-500/30 text-center space-y-2">
                  <span className="text-[10px] font-extrabold text-indigo-300 uppercase tracking-wider block font-sans">
                    CURRENT MARKET REGIME
                  </span>

                  <span className={`text-3xl font-black font-mono tracking-tight block ${
                    safeRegime.regime === 'RISK_OFF' ? 'text-red-400' : safeRegime.regime === 'NEUTRAL' ? 'text-amber-400' : 'text-emerald-400'
                  }`}>
                    {safeRegime.regime}
                  </span>

                  <div className="flex items-center justify-center gap-2 pt-2">
                    <span className="px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 font-mono text-xs font-black border border-emerald-500/30">
                      50/200 DMA gap: {safeRegime.dmaCrossPct === null ? 'Unavailable' : `${safeRegime.dmaCrossPct.toFixed(2)}%`}
                    </span>
                    <span className="px-2.5 py-1 rounded-full bg-cyan-500/20 text-cyan-300 font-mono text-xs font-black border border-cyan-500/30">
                      Multiplier: {safeRegime.positionSizingMultiplier}
                    </span>
                  </div>
                </div>

                <div className="mt-4 space-y-2 text-xs font-mono">
                  <div className="p-2.5 rounded-lg bg-[#080B10] border border-white/5 flex justify-between gap-3">
                    <span className="text-gray-400 font-sans">Market Session</span>
                    <span className="text-white font-bold text-right">{safeRegime.marketLabel}</span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-[#080B10] border border-white/5 flex justify-between">
                    <span className="text-gray-400 font-sans">India VIX Volatility</span>
                    <span className="text-white font-bold">{safeRegime.vixValue > 0 ? safeRegime.vixValue : 'Unavailable'} ({vixRisk})</span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-[#080B10] border border-white/5 flex justify-between">
                    <span className="text-gray-400 font-sans">Market Regime</span>
                    <span className="text-emerald-400 font-bold">{safeRegime.regime}</span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-[#080B10] border border-white/5 flex justify-between">
                    <span className="text-gray-400 font-sans">Position Size Multiplier</span>
                    <span className="text-cyan-300 font-bold">{safeRegime.positionSizingMultiplier}</span>
                  </div>
                </div>
                <p className="mt-3 text-[10px] leading-relaxed text-gray-400">{safeRegime.detail}</p>
                <p className="mt-2 text-[10px] text-gray-500 font-mono">
                  Scan: {formatAsOf(safeRegime.scanTimestamp)}{safeRegime.scanIsStale ? ' · stale/unavailable' : ''}
                </p>
              </div>

              <div className={`p-3 rounded-xl border text-[11px] font-sans ${
                safeRegime.scanIsStale ? 'bg-amber-500/10 border-amber-500/20 text-amber-100' : 'bg-cyan-500/10 border-cyan-500/20 text-cyan-200'
              }`}>
                <strong>Flow context:</strong>{' '}
                {latestFlow
                  ? `Latest combined FII/DII net flow is ${INR}${latestFlow.totalNetCr.toLocaleString('en-IN')} Cr for ${latestFlow.date}. This is end-of-day context, not a trade recommendation.`
                  : 'Institutional flow data is unavailable.'}
              </div>
            </div>
          </div>
        </>
      ) : (
        /* Tab 2: Grounded AI Multi-LLM Chat & Position Calculator */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left: Position Calculator & Technical Matrix */}
          <div className="lg:col-span-5 space-y-6">
            <div className="bg-[#0D111A]/80 backdrop-blur-xl border border-white/10 rounded-2xl p-5 shadow-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <h3 className="text-sm font-bold text-white flex items-center gap-2 font-sans">
                  <Calculator className="w-4 h-4 text-cyan-400" />
                  Position Size & Risk Governor
                </h3>
              </div>

              <div className="space-y-3 font-mono text-xs">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-gray-400 block mb-1 font-sans">Portfolio Capital ({INR})</label>
                    <input
                      type="number"
                      value={calcCapital}
                      onChange={(e) => setCalcCapital(Number(e.target.value))}
                      className="w-full px-2.5 py-1.5 bg-[#080B10] border border-white/10 rounded-lg text-white font-bold"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] text-gray-400 block mb-1 font-sans">Max Risk (% Per Trade)</label>
                    <input
                      type="number"
                      step="0.5"
                      value={calcRiskPct}
                      onChange={(e) => setCalcRiskPct(Number(e.target.value))}
                      className="w-full px-2.5 py-1.5 bg-[#080B10] border border-white/10 rounded-lg text-cyan-300 font-bold"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] text-gray-400 block mb-1 font-sans">Entry Price ({INR})</label>
                    <input
                      type="number"
                      step="0.05"
                      value={calcEntryPrice}
                      onChange={(e) => setCalcEntryPrice(Number(e.target.value))}
                      className="w-full px-2.5 py-1.5 bg-[#080B10] border border-white/10 rounded-lg text-white font-bold"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] text-gray-400 block mb-1 font-sans">Stop Loss ({INR})</label>
                    <input
                      type="number"
                      step="0.05"
                      value={calcStopLoss}
                      onChange={(e) => setCalcStopLoss(Number(e.target.value))}
                      className="w-full px-2.5 py-1.5 bg-[#080B10] border border-red-500/30 text-red-300 rounded-lg font-bold"
                    />
                  </div>
                </div>

                <div className="p-3 bg-cyan-500/10 border border-cyan-500/20 rounded-xl space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-300 font-sans">Allowed Risk Capital:</span>
                    <span className="text-cyan-300 font-bold">{INR}{allowedRiskRs.toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm font-extrabold text-white pt-1 border-t border-cyan-500/20">
                    <span>Calculated Quantity:</span>
                    <span className="text-emerald-400">{calculatedShares} Qty</span>
                  </div>
                  <div className="flex justify-between items-center text-[11px] text-gray-400 pt-1">
                    <span>Deployed: {INR}{totalCapitalDeployed.toLocaleString('en-IN')}</span>
                    <span>Max Loss: {INR}{maxLossRs.toLocaleString('en-IN')}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right: APEX Intelligence Chat Window */}
          <div className="lg:col-span-7 bg-[#0D111A]/80 backdrop-blur-xl border border-white/10 rounded-2xl p-5 shadow-2xl flex flex-col justify-between min-h-[520px]">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-cyan-400" />
                <h3 className="text-sm font-bold text-white font-sans">APEX Intelligence</h3>
              </div>

              {/* Single Model Status Badge */}
              <div
                style={{
                  background: 'rgba(6, 182, 212, 0.15)',
                  border: '1px solid rgba(6, 182, 212, 0.4)',
                  color: '#38BDF8',
                  borderRadius: '8px',
                  padding: '6px 14px',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                }}
                className="flex items-center gap-1.5 shrink-0 select-none"
              >
                <span className="inline-flex items-center gap-1.5"><Zap className="h-4 w-4" /> APEX Intelligence Grounded AI</span>
              </div>
            </div>

            {/* Chat Feed */}
            <div className="flex-1 my-4 space-y-4 overflow-y-auto max-h-[350px] pr-2 font-mono text-xs">
              {chatMessages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl p-3.5 space-y-1 ${
                      msg.sender === 'user'
                        ? 'bg-cyan-500/20 border border-cyan-500/30 text-cyan-100 rounded-tr-none'
                        : 'bg-[#080B10] border border-white/10 text-gray-200 rounded-tl-none whitespace-pre-wrap leading-relaxed'
                    }`}
                  >
                    <p>{msg.text}</p>
                  </div>
                  <span className="text-[9px] text-gray-500 mt-1 px-1">{msg.time}</span>
                </div>
              ))}

              {chatLoading && (
                <div className="flex items-center gap-2 text-cyan-400 text-xs font-sans p-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Processing query with APEX Intelligence...</span>
                </div>
              )}
            </div>

            {/* Chat Input */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendQuery();
              }}
              className="flex items-center gap-2 pt-2 border-t border-white/10"
            >
              <input
                type="text"
                placeholder="Ask APEX Intelligence Analyst about institutional deals or signals..."
                value={userInput}
                onChange={(e) => setUserInput(e.target.value)}
                className="flex-1 px-4 py-2 bg-[#080B10] border border-white/10 rounded-xl text-xs text-white placeholder-gray-500 focus:border-cyan-500/50 outline-none"
              />
              <button
                type="submit"
                disabled={chatLoading}
                className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-600 text-black font-bold text-xs flex items-center gap-1.5 transition-all shadow-md shadow-cyan-500/20 cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Send</span>
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
