import React, { useEffect, useState } from 'react';
import { Building2, Loader2, Search, ShieldCheck, X } from 'lucide-react';
import { apiJson } from '../lib/api';
import { TechnicalChartPanel } from './TechnicalChartPanel';

interface StockDeepDiveData {
  symbol: string;
  companyName: string;
  sector: string;
  price: {
    current: number;
    dayChange: number;
    dayChangePct: number;
    high52w: number | null;
    low52w: number | null;
    volumeRatio: number | null;
  };
  fundamentals: Record<string, number | null>;
  technicals: {
    rsi14: number | null;
    ema20: number | null;
    ema50: number | null;
    dma200: number | null;
    trend: string;
  };
  institutionalDeals: Array<{
    id: string;
    clientName: string;
    entityType: string;
    dealType: string;
    quantity: number;
    price: number;
    totalValueCr: number;
    tradeDate: string;
  }>;
  aiAudit: {
    score: number | null;
    grade: string;
    badgeLabel: string;
    badgeColor: string;
    pros: string[];
    cons: string[];
    verdict: string;
  };
}

interface StockDeepDiveModalProps {
  initialTicker?: string | null;
  isOpen?: boolean;
  onClose?: () => void;
}

type Tab = 'overview' | 'chart' | 'deals' | 'audit';

const formatNumber = (value: number | null | undefined, suffix = '') => value == null
  ? 'Unavailable'
  : `${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}${suffix}`;

export const StockDeepDiveModal: React.FC<StockDeepDiveModalProps> = ({ initialTicker, isOpen: propIsOpen, onClose }) => {
  const [isOpen, setIsOpen] = useState(Boolean(propIsOpen || initialTicker));
  const [ticker, setTicker] = useState(initialTicker || '');
  const [searchInput, setSearchInput] = useState('');
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<StockDeepDiveData | null>(null);

  useEffect(() => {
    if (propIsOpen !== undefined) setIsOpen(propIsOpen);
  }, [propIsOpen]);

  useEffect(() => {
    if (!initialTicker) return;
    setTicker(initialTicker.toUpperCase());
    setIsOpen(true);
  }, [initialTicker]);

  useEffect(() => {
    const openFromEvent = (event: Event) => {
      const requestedTicker = (event as CustomEvent<{ ticker?: string }>).detail?.ticker?.trim().toUpperCase();
      if (!requestedTicker || !/^[A-Z0-9&.-]{1,20}$/.test(requestedTicker)) return;
      setTicker(requestedTicker);
      setIsOpen(true);
    };
    const keyHandler = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setIsOpen(true);
      }
      if (event.key === 'Escape') setIsOpen(false);
    };
    window.addEventListener('open-stock-modal', openFromEvent);
    window.addEventListener('keydown', keyHandler);
    return () => {
      window.removeEventListener('open-stock-modal', openFromEvent);
      window.removeEventListener('keydown', keyHandler);
    };
  }, []);

  useEffect(() => {
    if (!isOpen || !ticker) return;
    setLoading(true);
    setError(null);
    setData(null);
    apiJson<{ data: StockDeepDiveData }>(`/api/stock/${encodeURIComponent(ticker)}/deep-dive`)
      .then(response => setData(response.data))
      .catch((fetchError: any) => setError(fetchError?.message || 'Stock intelligence is unavailable.'))
      .finally(() => setLoading(false));
  }, [isOpen, ticker]);

  const close = () => {
    setIsOpen(false);
    onClose?.();
  };

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    const nextTicker = searchInput.trim().toUpperCase();
    if (!/^[A-Z0-9&.-]{1,20}$/.test(nextTicker)) {
      setError('Enter a valid NSE ticker.');
      return;
    }
    setTicker(nextTicker);
    setSearchInput('');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      <div className="bg-[#0B0F19] border border-white/10 rounded-2xl max-w-5xl w-full shadow-2xl overflow-hidden">
        <div className="p-4 border-b border-white/10 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-black text-white">{data?.companyName || ticker || 'Stock intelligence'}</h2>
            <p className="text-xs text-gray-400">{ticker || 'Enter a ticker'}{data ? ` · ${data.sector}` : ''}</p>
          </div>
          <form onSubmit={submitSearch} className="flex gap-2">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-gray-500" />
              <input value={searchInput} onChange={event => setSearchInput(event.target.value)} placeholder="NSE ticker" className="pl-9 pr-3 py-2 bg-[#080B10] border border-white/10 rounded-xl text-xs text-white" />
            </div>
            <button type="submit" className="px-3 py-2 bg-cyan-500 text-black rounded-xl text-xs font-bold">Load</button>
            <button type="button" onClick={close} className="p-2 bg-white/5 rounded-xl text-gray-400" aria-label="Close"><X className="w-4 h-4" /></button>
          </form>
        </div>

        <div className="px-4 pt-4 flex gap-2">
          {(['overview', 'chart', 'deals', 'audit'] as Tab[]).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)} className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase ${activeTab === tab ? 'bg-cyan-500 text-black' : 'bg-white/5 text-gray-400'}`}>{tab}</button>
          ))}
        </div>

        <div className="p-4 min-h-[420px]">
          {loading && <div className="h-72 flex items-center justify-center gap-2 text-cyan-300"><Loader2 className="w-5 h-5 animate-spin" />Loading sourced data…</div>}
          {error && !loading && <div className="h-72 flex items-center justify-center text-amber-300 text-sm">{error}</div>}
          {!loading && !error && !data && <div className="h-72 flex items-center justify-center text-gray-500">Enter a ticker to load data.</div>}

          {data && !loading && activeTab === 'overview' && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  ['Last price', data.price.current > 0 ? `₹${formatNumber(data.price.current)}` : 'Unavailable'],
                  ['Day change', data.price.current > 0 ? `${formatNumber(data.price.dayChangePct, '%')}` : 'Unavailable'],
                  ['52-week high', data.price.high52w == null ? 'Unavailable' : `₹${formatNumber(data.price.high52w)}`],
                  ['52-week low', data.price.low52w == null ? 'Unavailable' : `₹${formatNumber(data.price.low52w)}`],
                ].map(([label, value]) => <div key={label} className="p-3 bg-[#080B10] border border-white/10 rounded-xl"><span className="text-[10px] text-gray-500 block uppercase">{label}</span><span className="text-white font-mono font-bold">{value}</span></div>)}
              </div>
              <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
                {Object.entries(data.fundamentals).map(([key, value]) => <div key={key} className="p-3 border-b border-white/10 flex justify-between text-xs"><span className="text-gray-400">{key}</span><span className="text-white font-mono">{formatNumber(value)}</span></div>)}
              </div>
              <div className="p-4 rounded-xl bg-[#080B10] border border-white/10 flex items-center gap-3"><Building2 className="w-5 h-5 text-cyan-400" /><span className="text-sm text-gray-300">Technical trend: <strong className="text-white">{data.technicals.trend}</strong></span></div>
            </div>
          )}

          {data && !loading && activeTab === 'chart' && <TechnicalChartPanel ticker={data.symbol} />}

          {data && !loading && activeTab === 'deals' && (
            <div className="space-y-3">
              {data.institutionalDeals.length === 0 && <p className="text-sm text-gray-500">No stored institutional deals are available for this ticker.</p>}
              {data.institutionalDeals.map(deal => <div key={deal.id} className="p-3 bg-[#080B10] border border-white/10 rounded-xl text-xs grid sm:grid-cols-4 gap-2"><span className="text-white font-bold">{deal.clientName}</span><span className={deal.dealType === 'BUY' ? 'text-emerald-400' : 'text-red-400'}>{deal.dealType}</span><span className="text-gray-300">{deal.quantity.toLocaleString('en-IN')} @ ₹{formatNumber(deal.price)}</span><span className="text-gray-500">{deal.tradeDate}</span></div>)}
            </div>
          )}

          {data && !loading && activeTab === 'audit' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl border border-white/10 bg-[#080B10] flex gap-3"><ShieldCheck className="w-5 h-5" style={{ color: data.aiAudit.badgeColor }} /><div><h3 className="text-white font-bold">{data.aiAudit.badgeLabel}{data.aiAudit.score == null ? '' : ` · ${data.aiAudit.score}/100`}</h3><p className="text-xs text-gray-400 mt-1">{data.aiAudit.verdict}</p></div></div>
              <div className="grid md:grid-cols-2 gap-4"><div><h4 className="text-xs font-bold text-emerald-400 mb-2">Confirmed strengths</h4>{data.aiAudit.pros.map(item => <p key={item} className="text-xs text-gray-300 mb-1">• {item}</p>)}</div><div><h4 className="text-xs font-bold text-amber-400 mb-2">Risks / limitations</h4>{data.aiAudit.cons.map(item => <p key={item} className="text-xs text-gray-300 mb-1">• {item}</p>)}</div></div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};


