import React, { useState } from 'react';
import { 
  Bookmark, 
  Trash2, 
  Rocket, 
  Search, 
  TrendingUp, 
  TrendingDown, 
  CheckCircle2, 
  Zap,
  Flame,
  Layers
} from 'lucide-react';
import { WatchlistItem, ScanItem } from '../types';

interface WatchlistPageProps {
  watchlist: WatchlistItem[];
  onRemoveItem: (id: string) => void;
  onOpenLogTrade: (item: ScanItem) => void;
}

export const WatchlistPage: React.FC<WatchlistPageProps> = ({
  watchlist = [],
  onRemoveItem,
  onOpenLogTrade,
}) => {
  const [searchQuery, setSearchQuery] = useState<string>('');

  const safeWatchlist = Array.isArray(watchlist) ? watchlist : [];

  const filteredWatchlist = safeWatchlist.filter(
    (w) =>
      w.ticker?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (w.sector && w.sector.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (w.setupType && w.setupType.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="bg-[#0D1117] border border-white/10 rounded-2xl p-6 shadow-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-white flex items-center gap-2">
            <Bookmark className="w-7 h-7 text-cyan-400" />
            Watchlist High-Density Scanner
          </h1>
          <p className="text-xs text-gray-400 mt-1">
            Monitored swing setups. Real-time LTP updates dynamically with Buy Zone trigger alerts.
          </p>
        </div>

        <div className="flex items-center gap-3 font-mono text-xs">
          <div className="px-3 py-1.5 rounded-xl bg-[#080B10] border border-white/10 text-gray-300">
            Total Saved: <strong className="text-cyan-400 font-extrabold">{watchlist.length} Setups</strong>
          </div>
        </div>
      </div>

      {/* Search Toolbar */}
      <div className="bg-[#0D1117] border border-white/10 rounded-2xl p-4 shadow-xl">
        <div className="relative">
          <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search watchlist by ticker symbol or sector..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-[#080B10] border border-white/10 rounded-xl text-xs text-white placeholder-gray-500 focus:border-cyan-500/50 outline-none"
          />
        </div>
      </div>

      {/* High-Density Tabular Grid */}
      <div className="bg-[#0D1117] border border-white/10 rounded-2xl shadow-xl overflow-hidden">
        {filteredWatchlist.length === 0 ? (
          <div className="p-12 text-center text-gray-400 space-y-2">
            <Bookmark className="w-10 h-10 text-gray-500 mx-auto" />
            <p className="text-sm font-semibold text-gray-300">Your watchlist is currently empty.</p>
            <p className="text-xs text-gray-500">Go to the Dashboard to add high-conviction swing setups!</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-[#080B10] text-gray-400 font-mono text-[11px] border-b border-white/10 uppercase tracking-wider">
                  <th className="p-3.5 font-semibold">Ticker & Sector</th>
                  <th className="p-3.5 font-semibold">Signal</th>
                  <th className="p-3.5 font-semibold">Live LTP</th>
                  <th className="p-3.5 font-semibold">Buy Zone</th>
                  <th className="p-3.5 font-semibold">Target 1</th>
                  <th className="p-3.5 font-semibold">Stop Loss</th>
                  <th className="p-3.5 font-semibold">Risk:Reward</th>
                  <th className="p-3.5 font-semibold">AI Score</th>
                  <th className="p-3.5 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 font-mono">
                {filteredWatchlist.map((item) => {
                  const signalColor =
                    item.signal === 'BUY'
                      ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                      : item.signal === 'LIGHT BUY'
                      ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30'
                      : 'bg-amber-500/15 text-amber-300 border-amber-500/30';

                  const snapshot = item.snapshot ?? {};
                  const snapshotNumber = (key: string) => typeof snapshot[key] === 'number' ? snapshot[key] as number : 0;
                  const snapshotReasons = Array.isArray(snapshot.aiReasons)
                    ? snapshot.aiReasons.filter((reason): reason is string => typeof reason === 'string')
                    : [];
                  const ltp = item.ltp ?? 0;
                  const scanItem: ScanItem = {
                    id: item.id,
                    ticker: item.ticker,
                    companyName: item.companyName || item.ticker,
                    sector: item.sector || 'Unavailable',
                    capCategory: 'UNKNOWN',
                    setupType: item.setupType || 'Watchlist Signal',
                    confidenceScore: item.confidenceScore ?? 0,
                    ltp,
                    changePct: snapshotNumber('changePct'),
                    buyZoneMin: item.buyZone ?? ltp,
                    buyZoneMax: item.buyZone ?? ltp,
                    target1: item.target ?? 0,
                    target1Pct: item.targetPct ?? 0,
                    stopLoss: item.stopLoss ?? 0,
                    stopLossPct: item.slPct ?? 0,
                    riskReward: item.riskReward ?? 0,
                    dma200: snapshotNumber('dma200'),
                    ema50: snapshotNumber('ema50'),
                    ema20: snapshotNumber('ema20'),
                    rsi14: snapshotNumber('rsi14'),
                    adx14: snapshotNumber('adx14'),
                    volumeRatio: snapshotNumber('volumeRatio'),
                    pctFrom52wHigh: snapshotNumber('pctFrom52wHigh'),
                    ichimokuBullish: snapshot.ichimokuBullish === true,
                    supertrendBullish: snapshot.supertrendBullish === true,
                    isSqueeze: snapshot.isSqueeze === true,
                    sparkline: Array.isArray(snapshot.sparkline) ? snapshot.sparkline.filter((value): value is number => typeof value === 'number') : [],
                    aiReasons: snapshotReasons,
                  };
                  const canConvert = ltp > 0 && (item.stopLoss ?? 0) > 0 && (item.stopLoss ?? 0) < ltp && (item.target ?? 0) > ltp;

                  return (
                    <tr key={item.id} className="hover:bg-white/5 transition-colors">
                      <td className="p-3.5">
                        <div className="font-bold text-white text-sm">{item.ticker}</div>
                        <div className="text-[10px] text-gray-400 font-sans">{item.sector}</div>
                      </td>

                      <td className="p-3.5">
                        <span className={`px-2.5 py-1 rounded-lg font-bold text-[10px] border ${signalColor}`}>
                          {item.signal}
                        </span>
                      </td>

                      <td className="p-3.5 font-bold text-gray-100 text-sm">
                        {item.ltp ? `₹${item.ltp.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : 'Unavailable'}
                      </td>

                      <td className="p-3.5 text-gray-300">
                        {item.buyZone || item.ltp ? `₹${(item.buyZone || item.ltp)!.toLocaleString('en-IN')}` : 'Unavailable'}
                      </td>

                      <td className="p-3.5 text-emerald-400 font-bold">
                        {item.target ? `₹${item.target.toLocaleString('en-IN')}` : 'Unavailable'}
                      </td>

                      <td className="p-3.5 text-red-400 font-bold">
                        {item.stopLoss ? `₹${item.stopLoss.toLocaleString('en-IN')}` : 'Unavailable'}
                      </td>

                      <td className="p-3.5 text-cyan-300 font-bold">
                        {item.riskReward ? `1 : ${item.riskReward}` : 'Unavailable'}
                      </td>

                      <td className="p-3.5 text-cyan-400 font-bold">
                        {item.confidenceScore != null ? `${item.confidenceScore}/10` : 'Unavailable'}
                      </td>

                      <td className="p-3.5 text-right font-sans">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => canConvert && onOpenLogTrade(scanItem)}
                            disabled={!canConvert}
                            className="px-3 py-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 disabled:opacity-40 text-emerald-300 border border-emerald-500/30 text-xs font-semibold flex items-center gap-1 transition-all"
                          >
                            <Rocket className="w-3.5 h-3.5 text-emerald-400" />
                            <span>Convert to Trade</span>
                          </button>

                          <button
                            onClick={() => onRemoveItem(item.id)}
                            className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 transition-all"
                            title="Remove from Watchlist"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};


