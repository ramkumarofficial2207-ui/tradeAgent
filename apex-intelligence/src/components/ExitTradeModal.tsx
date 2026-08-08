import React, { useState } from 'react';
import { X, AlertTriangle, CheckCircle2, DollarSign } from 'lucide-react';
import { Trade } from '../types';

interface ExitTradeModalProps {
  trade: Trade | null;
  onClose: () => void;
  onConfirmExit: (tradeId: string, exitData: any) => void;
}

export const ExitTradeModal: React.FC<ExitTradeModalProps> = ({
  trade,
  onClose,
  onConfirmExit,
}) => {
  if (!trade) return null;

  const [exitPrice, setExitPrice] = useState<number>(trade.currentPrice || trade.entryPrice);
  const [exitReason, setExitReason] = useState<'TARGET' | 'STOP' | 'TRAIL' | 'MANUAL'>('TARGET');

  const pnlRs = Math.round((exitPrice - trade.entryPrice) * trade.quantity * 100) / 100;
  const pnlPct = Math.round(((exitPrice - trade.entryPrice) / trade.entryPrice) * 10000) / 100;

  const initialRiskPerShare = Math.abs(trade.entryPrice - trade.stopLossInit);
  const rMultiple = initialRiskPerShare > 0 ? (pnlRs / (initialRiskPerShare * trade.quantity)).toFixed(2) : '0';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onConfirmExit(trade.id, {
      status: 'CLOSED',
      exitPrice,
      exitReason,
    });
  };

  const isProfit = pnlRs >= 0;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-[#0D1117] border border-white/10 rounded-2xl max-w-md w-full p-6 shadow-2xl relative text-gray-200">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-all"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 border-b border-white/10 pb-4 mb-4">
          <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 font-bold">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              Close Trade Position
              <span className="px-2 py-0.5 rounded text-[10px] bg-cyan-500/10 text-cyan-400 font-mono">
                {trade.ticker}
              </span>
            </h2>
            <p className="text-xs text-gray-400">Record Trade Realized P&L and R-Multiple</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs font-sans">
          <div className="p-3 bg-[#080B10] rounded-xl border border-white/5 font-mono space-y-1">
            <div className="flex justify-between text-gray-400">
              <span>Entry Price:</span>
              <span className="text-white font-bold">₹{trade.entryPrice.toLocaleString('en-IN')}</span>
            </div>
            <div className="flex justify-between text-gray-400">
              <span>Quantity:</span>
              <span className="text-white font-bold">{trade.quantity} Shares</span>
            </div>
            <div className="flex justify-between text-gray-400">
              <span>Initial Risk:</span>
              <span className="text-red-400 font-bold">₹{(trade.initialRiskRs || 0).toLocaleString('en-IN')}</span>
            </div>
          </div>

          <div>
            <label className="text-[11px] text-gray-400 block mb-1 font-mono">Final Exit Price (₹)</label>
            <input
              type="number"
              step="0.05"
              value={exitPrice}
              onChange={(e) => setExitPrice(Number(e.target.value))}
              className="w-full px-3 py-2 bg-[#080B10] border border-white/10 rounded-xl text-white font-mono font-bold text-base focus:border-cyan-500/50 outline-none"
            />
          </div>

          <div>
            <label className="text-[11px] text-gray-400 block mb-1">Exit Trigger / Reason</label>
            <select
              value={exitReason}
              onChange={(e: any) => setExitReason(e.target.value)}
              className="w-full px-3 py-2 bg-[#080B10] border border-white/10 rounded-xl text-gray-200 text-xs focus:border-cyan-500/50 outline-none"
            >
              <option value="TARGET">Hit Target 1 / Target 2 🎯</option>
              <option value="TRAIL">Trailing Stop Loss Hit 🛑</option>
              <option value="STOP">Initial Stop Loss Hit 💥</option>
              <option value="MANUAL">Manual Discretionary Exit 🖐️</option>
            </select>
          </div>

          {/* Realized P&L Summary Card */}
          <div
            className={`p-4 rounded-xl border font-mono space-y-1 text-center ${
              isProfit
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : 'bg-red-500/10 border-red-500/30 text-red-300'
            }`}
          >
            <span className="text-[10px] uppercase font-sans tracking-wider block text-gray-400">ESTIMATED REALIZED P&L</span>
            <div className="text-2xl font-extrabold">
              {isProfit ? '+' : ''}₹{pnlRs.toLocaleString('en-IN')} ({pnlPct >= 0 ? '+' : ''}{pnlPct}%)
            </div>
            <div className="text-xs font-bold text-gray-300">
              Achieved R-Multiple: <span className={isProfit ? 'text-emerald-400' : 'text-red-400'}>{rMultiple}R</span>
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-600 text-black font-bold flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/20 transition-all"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Confirm Exit & Close</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
