import React, { useState } from 'react';
import { 
  Star, 
  CheckCircle2, 
  Zap,
  TrendingUp,
  ArrowRight
} from 'lucide-react';
import { ScanItem } from '../types';

interface SetupCardProps {
  item: ScanItem;
  onAddToWatchlist: (item: ScanItem) => void;
  onOpenLogTrade: (item: ScanItem) => void;
  onOpenDeepAnalysis: (item: ScanItem) => void;
  isInWatchlist: boolean;
}

export const SetupCard: React.FC<SetupCardProps> = ({
  item,
  onAddToWatchlist,
  onOpenLogTrade,
  onOpenDeepAnalysis,
  isInWatchlist,
}) => {
  const buyMin = item.buyZoneMin || item.ltp * 0.99;
  const buyMax = item.buyZoneMax || item.ltp * 1.01;
  const isMonitorBase = item.status === 'QUALIFIED' || item.aiSignal === 'WATCH';
  const buyZoneLabel = buyMax > buyMin
    ? `₹${buyMin.toFixed(2)} - ₹${buyMax.toFixed(2)}`
    : `₹${buyMin.toFixed(2)}`;
  const rationale = item.aiReasons?.length
    ? item.aiReasons.join(' • ')
    : 'No grounded rationale is available for this setup.';
  const actionHint = isMonitorBase
    ? 'Monitor this base and wait for trigger-price and volume confirmation before entry.'
    : `${item.setupType} setup: verify the trigger conditions before entering.`;

  // Calculate visual progress from SL to T1
  const sl = item.stopLoss || item.ltp * 0.95;
  const t1 = item.target1 || item.ltp * 1.15;
  const range = t1 - sl || 1;
  const currentPosPct = Math.min(Math.max(((item.ltp - sl) / range) * 100, 5), 95);

  return (
    <div 
      onClick={() => onOpenDeepAnalysis(item)}
      className="bg-[#080B10] border border-cyan-500/20 hover:border-cyan-400/50 rounded-2xl p-4 shadow-xl flex flex-col justify-between gap-3 transition-all duration-200 cursor-pointer group"
    >
      {/* Card Header Row */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="text-base font-extrabold text-white tracking-tight font-mono group-hover:text-cyan-400 transition-colors">{item.ticker}</h3>
          
          <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase bg-indigo-950/80 text-indigo-300 border border-indigo-500/30">
            {item.sector}
          </span>

          {isMonitorBase ? (
            <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase bg-amber-950/80 text-amber-300 border border-amber-500/30 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"></span>
              MONITOR BASE
            </span>
          ) : (
            <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase bg-emerald-950/80 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
              <Zap className="w-2.5 h-2.5 text-emerald-400 fill-emerald-400" />
              TRIGGERED
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button 
            onClick={(e) => {
              e.stopPropagation();
              onAddToWatchlist(item);
            }}
            className={`p-1 rounded-lg transition-colors ${
              isInWatchlist ? 'text-amber-400 fill-amber-400' : 'text-gray-400 hover:text-white'
            }`}
            title={isInWatchlist ? 'Saved in Watchlist' : 'Add to Watchlist'}
          >
            <Star className={`w-4 h-4 ${isInWatchlist ? 'fill-amber-400' : ''}`} />
          </button>

          {/* Confidence Circle Ring */}
          <div className="w-7 h-7 rounded-full border-2 border-cyan-400 text-cyan-300 font-mono text-xs font-black flex items-center justify-center bg-cyan-500/10 shrink-0">
            {Math.round(item.confidenceScore)}
          </div>
        </div>
      </div>

      {/* Buy Zone Info Row */}
      <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-mono font-medium">
        <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0"></span>
        <span>{isMonitorBase ? `Base Zone: ${buyZoneLabel}` : `Buy Zone: ${buyZoneLabel}`}</span>
      </div>

      {/* Visual SL to T1 Progress Line Bar */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-[10px] font-mono">
          <span className="text-red-400 font-bold">SL ₹{sl.toFixed(1)}</span>
          <span className="text-cyan-400 font-bold">T1 ₹{t1.toFixed(1)}</span>
        </div>
        <div className="w-full h-1.5 bg-gray-900 rounded-full overflow-hidden relative border border-white/5">
          <div 
            className="h-full bg-gradient-to-r from-red-500 via-amber-400 to-emerald-400 rounded-full"
            style={{ width: `${currentPosPct}%` }}
          />
        </div>
      </div>

      {/* Targets & Stop Loss 2-Column Grid Box */}
      <div className="grid grid-cols-2 gap-3 p-2.5 rounded-xl bg-[#0D1117] border border-white/5 text-xs font-mono">
        {/* Targets Col */}
        <div className="space-y-1">
          <span className="text-[9px] font-bold text-gray-500 uppercase tracking-wider block font-sans">TARGETS</span>
          <div className="flex items-center justify-between">
            <span className="text-gray-400 text-[10px]">T1</span>
            <span className="text-emerald-400 font-bold">₹{item.target1 ? item.target1.toFixed(2) : (item.ltp * 1.15).toFixed(2)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-400 text-[10px]">T2</span>
            <span className="text-emerald-400 font-bold">{item.target2 ? `₹${item.target2.toFixed(2)}` : 'Unavailable'}</span>
          </div>
        </div>

        {/* Stop Loss Col */}
        <div className="space-y-1 border-l border-white/10 pl-3">
          <span className="text-[9px] font-bold text-gray-500 uppercase tracking-wider block font-sans">STOP LOSS</span>
          <div className="flex items-center justify-between">
            <span className="text-gray-400 text-[10px]">SL</span>
            <span className="text-red-400 font-bold">₹{sl.toFixed(2)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-400 text-[10px]">R:R</span>
            <span className="text-white font-bold">{item.riskReward ? item.riskReward.toFixed(1) : '2.5'} : 1</span>
          </div>
        </div>
      </div>

      {/* Grounded AI Triggers Box */}
      <div className="p-2 rounded-xl bg-cyan-950/30 border border-cyan-500/20 text-[11px] text-cyan-200/90 leading-relaxed font-sans">
        <p className="line-clamp-3">
          {rationale}
        </p>
      </div>

      {/* Action Hint Banner */}
      <div className="p-2 rounded-lg bg-teal-950/40 border border-teal-500/30 text-[10px] text-teal-300 font-medium">
        {actionHint}
      </div>

      {/* Bottom Action Row */}
      <div className="flex items-center justify-between pt-1">
        <button 
          onClick={() => onOpenDeepAnalysis(item)}
          className="text-[11px] text-cyan-400 hover:text-cyan-300 font-semibold underline decoration-cyan-500/30 underline-offset-2"
        >
          View Technicals
        </button>

        <button
          onClick={(e) => {
            e.stopPropagation();
            onOpenLogTrade(item);
          }}
          className="px-4 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold text-xs flex items-center gap-1.5 shadow-md shadow-emerald-500/20 transition-all cursor-pointer"
        >
          <span>Trade</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
