import React, { useEffect, useState } from 'react';
import { Check, Newspaper, Plus, ShieldAlert, Sparkles, X } from 'lucide-react';
import { ScanItem } from '../types';
import { apiJson } from '../lib/api';
import TradingViewChart from './TradingViewChart';

interface DeepAnalysisModalProps {
  item: ScanItem | null;
  onClose: () => void;
  onAddToWatchlist?: (item: ScanItem) => void;
  onOpenLogTrade?: (item: ScanItem) => void;
  isInWatchlist?: boolean;
}

interface NewsItem {
  id: string;
  title: string;
  source: string;
  timeAgo: string;
  summary: string;
  url?: string;
  sentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  impact: 'HIGH' | 'MEDIUM' | 'LOW';
}

type ModalTab = 'chart' | 'setup' | 'news';

export const DeepAnalysisModal: React.FC<DeepAnalysisModalProps> = ({
  item,
  onClose,
  onAddToWatchlist,
  onOpenLogTrade,
  isInWatchlist = false,
}) => {
  const [activeTab, setActiveTab] = useState<ModalTab>('chart');
  const [news, setNews] = useState<NewsItem[]>([]);
  const [newsLoading, setNewsLoading] = useState(false);
  const [newsError, setNewsError] = useState<string | null>(null);

  useEffect(() => {
    if (activeTab !== 'news' || !item?.ticker) return;
    setNewsLoading(true);
    setNewsError(null);
    apiJson<{ news: NewsItem[] }>(`/api/stock/${encodeURIComponent(item.ticker)}/news`)
      .then(response => setNews(Array.isArray(response.news) ? response.news : []))
      .catch(() => {
        setNews([]);
        setNewsError('News data is currently unavailable.');
      })
      .finally(() => setNewsLoading(false));
  }, [activeTab, item?.ticker]);

  if (!item) return null;
  const canLogTrade = item.ltp > 0 && item.stopLoss > 0 && item.stopLoss < item.ltp && item.target1 > item.ltp;

  return (
    <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      <div className="bg-[#0B0F19] border border-cyan-500/30 rounded-2xl max-w-5xl w-full overflow-hidden shadow-2xl text-gray-200">
        <div className="bg-[#080B10] border-b border-white/10 p-4 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-black text-white font-mono">{item.ticker}</h1>
            <p className="text-xs text-gray-400">{item.companyName || item.ticker} · {item.sector || 'Sector unavailable'}</p>
          </div>
          <div className="flex items-center gap-2">
            {(['chart', 'setup', 'news'] as ModalTab[]).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase ${activeTab === tab ? 'bg-cyan-500 text-black' : 'bg-white/5 text-gray-300'}`}
              >
                {tab}
              </button>
            ))}
            <button onClick={onClose} className="p-2 rounded-lg bg-white/5 text-gray-400 hover:text-white" aria-label="Close analysis">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-4 sm:p-6 min-h-[420px]">
          {activeTab === 'chart' && <TradingViewChart ticker={item.ticker} />}

          {activeTab === 'setup' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 font-mono text-xs">
                {[
                  ['Last price', item.ltp > 0 ? `₹${item.ltp.toFixed(2)}` : 'Unavailable'],
                  ['Buy zone', item.buyZoneMin > 0 ? `₹${item.buyZoneMin.toFixed(2)}–₹${item.buyZoneMax.toFixed(2)}` : 'Unavailable'],
                  ['Stop loss', item.stopLoss > 0 ? `₹${item.stopLoss.toFixed(2)}` : 'Unavailable'],
                  ['Target 1', item.target1 > 0 ? `₹${item.target1.toFixed(2)}` : 'Unavailable'],
                  ['Risk/reward', item.riskReward > 0 ? `${item.riskReward.toFixed(2)}R` : 'Unavailable'],
                ].map(([label, value]) => (
                  <div key={label} className="p-3 rounded-xl bg-[#080B10] border border-white/10">
                    <span className="block text-[10px] text-gray-500 uppercase">{label}</span>
                    <span className="text-white font-bold">{value}</span>
                  </div>
                ))}
              </div>
              <div className="p-4 rounded-xl bg-[#080B10] border border-white/10">
                <h3 className="text-sm font-bold text-white flex items-center gap-2"><Sparkles className="w-4 h-4 text-cyan-400" />Scanner rationale</h3>
                {item.aiReasons?.length ? (
                  <ul className="mt-3 space-y-2 text-xs text-gray-300">
                    {item.aiReasons.map((reason, index) => <li key={index}>• {reason}</li>)}
                  </ul>
                ) : <p className="mt-3 text-xs text-gray-500">No stored rationale is available for this setup.</p>}
              </div>
              {!canLogTrade && (
                <p className="flex items-center gap-2 text-xs text-amber-300"><ShieldAlert className="w-4 h-4" />Trade logging is disabled until valid entry, stop, and target values are available.</p>
              )}
            </div>
          )}

          {activeTab === 'news' && (
            <div className="space-y-3">
              {newsLoading && <p className="text-sm text-gray-400">Loading grounded news…</p>}
              {newsError && <p className="text-sm text-amber-300">{newsError}</p>}
              {!newsLoading && !newsError && news.length === 0 && <p className="text-sm text-gray-500">No sourced news is available for this ticker.</p>}
              {news.map(article => (
                <a key={article.id} href={article.url} target="_blank" rel="noreferrer" className="block p-4 rounded-xl bg-[#080B10] border border-white/10 hover:border-cyan-500/30">
                  <div className="flex justify-between gap-3">
                    <h3 className="text-sm font-bold text-white">{article.title}</h3>
                    <Newspaper className="w-4 h-4 text-cyan-400 shrink-0" />
                  </div>
                  <p className="mt-2 text-xs text-gray-400 line-clamp-2">{article.summary}</p>
                  <p className="mt-2 text-[10px] text-gray-500">{article.source} · {article.timeAgo} · Heuristic sentiment: {article.sentiment}</p>
                </a>
              ))}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-white/10 flex justify-end gap-3">
          <button
            onClick={() => onAddToWatchlist?.(item)}
            disabled={isInWatchlist}
            className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-xs font-bold disabled:text-emerald-400"
          >
            {isInWatchlist ? <Check className="w-4 h-4 inline mr-1" /> : <Plus className="w-4 h-4 inline mr-1" />}
            {isInWatchlist ? 'In watchlist' : 'Add to watchlist'}
          </button>
          <button
            onClick={() => canLogTrade && onOpenLogTrade?.(item)}
            disabled={!canLogTrade}
            className="px-4 py-2 rounded-xl bg-cyan-500 text-black text-xs font-bold disabled:opacity-40"
          >
            Log paper trade
          </button>
        </div>
      </div>
    </div>
  );
};


