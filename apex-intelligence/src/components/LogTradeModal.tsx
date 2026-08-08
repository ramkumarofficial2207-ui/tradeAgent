import React, { useState } from 'react';
import { X, ShieldAlert, Calculator, Rocket, CheckCircle2 } from 'lucide-react';
import { ScanItem, User } from '../types';

interface LogTradeModalProps {
  item: ScanItem | null;
  user: User;
  onClose: () => void;
  onConfirmLogTrade: (tradeData: any) => void;
}

type LogTradeFormProps = Omit<LogTradeModalProps, 'item'> & { item: ScanItem };

export const LogTradeModal: React.FC<LogTradeModalProps> = (props) => {
  if (!props.item) return null;
  return <LogTradeForm {...props} item={props.item} />;
};

const LogTradeForm: React.FC<LogTradeFormProps> = ({
  item,
  user,
  onClose,
  onConfirmLogTrade,
}) => {
  const [entryPrice, setEntryPrice] = useState<number>(item.buyZoneMin || item.ltp);
  const [stopLoss, setStopLoss] = useState<number>(item.stopLoss);
  const [target1, setTarget1] = useState<number>(item.target1);
  const [target2, setTarget2] = useState<number>(item.target2 || 0);
  const [riskPct, setRiskPct] = useState<number>(user.maxRiskPct || 0);
  const [notes, setNotes] = useState<string>(`Logged from ApexScan AI scanner alert for ${item.setupType}.`);

  // Risk & Position Size Math
  const totalCapital = user.tradingCapital || 0;
  const allowedRiskRs = (totalCapital * riskPct) / 100;
  const riskPerShare = Math.max(entryPrice - stopLoss, 0);
  const calculatedQty = riskPerShare > 0 ? Math.floor(allowedRiskRs / riskPerShare) : 0;
  const [customQty, setCustomQty] = useState<number | null>(null);

  const finalQty = customQty !== null ? customQty : calculatedQty;
  const capitalDeployed = finalQty * entryPrice;
  const totalRiskRs = finalQty * riskPerShare;
  const capitalUtilizationPct = totalCapital > 0 ? (capitalDeployed / totalCapital) * 100 : 0;
  const potentialRewardRs = finalQty * (target1 - entryPrice);
  const calculatedRR = totalRiskRs > 0 ? (potentialRewardRs / totalRiskRs).toFixed(2) : '0';
  const isValid = totalCapital >= 10000 && riskPct >= 0.1 && riskPct <= 5 && entryPrice > 0 && stopLoss > 0 && stopLoss < entryPrice && target1 > entryPrice && target2 > target1 && finalQty > 0;

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;
    onConfirmLogTrade({
      ticker: item.ticker,
      companyName: item.companyName,
      sector: item.sector,
      capCategory: item.capCategory,
      setupType: item.setupType,
      entryPrice,
      quantity: finalQty,
      stopLossInit: stopLoss,
      target1,
      target2,
      notes,
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-[#0D1117] border border-white/10 rounded-2xl max-w-lg w-full p-6 shadow-2xl relative text-gray-200">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-all"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3 border-b border-white/10 pb-4 mb-4">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-bold">
            <Rocket className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              Log Paper Trade Position
              <span className="px-2 py-0.5 rounded text-[10px] bg-cyan-500/10 text-cyan-400 font-mono">
                {item.ticker}
              </span>
            </h2>
            <p className="text-xs text-gray-400">Position Size & Risk Governor Calculation</p>
          </div>
        </div>

        <form onSubmit={handleFormSubmit} className="space-y-4 text-xs font-sans">
          {/* Capital & Risk Settings */}
          <div className="p-3 bg-[#080B10] rounded-xl border border-white/5 space-y-2">
            <div className="flex justify-between items-center text-[11px] font-mono">
              <span className="text-gray-400">Trading Capital:</span>
              <span className="text-white font-bold">₹{totalCapital.toLocaleString('en-IN')}</span>
            </div>
            <div className="flex justify-between items-center">
              <label className="text-gray-400 text-[11px]">Max Risk Per Trade (%):</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="0.1"
                  min="0.5"
                  max="5.0"
                  value={riskPct}
                  onChange={(e) => setRiskPct(Number(e.target.value))}
                  className="w-20 px-2 py-1 bg-[#0D1117] border border-white/10 rounded font-mono text-cyan-300 font-bold text-center"
                />
                <span className="text-gray-400 text-[11px] font-mono">
                  (₹{allowedRiskRs.toLocaleString('en-IN')})
                </span>
              </div>
            </div>
          </div>

          {/* Trade Parameters Form Grid */}
          <div className="grid grid-cols-2 gap-3 font-mono">
            <div>
              <label className="text-[11px] text-gray-400 block mb-1">Entry Price (₹)</label>
              <input
                type="number"
                step="0.05"
                value={entryPrice}
                onChange={(e) => setEntryPrice(Number(e.target.value))}
                className="w-full px-3 py-2 bg-[#080B10] border border-white/10 rounded-xl text-white font-bold focus:border-cyan-500/50 outline-none"
              />
            </div>

            <div>
              <label className="text-[11px] text-gray-400 block mb-1">Stop Loss (₹)</label>
              <input
                type="number"
                step="0.05"
                value={stopLoss}
                onChange={(e) => setStopLoss(Number(e.target.value))}
                className="w-full px-3 py-2 bg-[#080B10] border border-red-500/30 text-red-300 rounded-xl font-bold focus:border-red-500 outline-none"
              />
            </div>

            <div>
              <label className="text-[11px] text-gray-400 block mb-1">Target 1 (₹)</label>
              <input
                type="number"
                step="0.05"
                value={target1}
                onChange={(e) => setTarget1(Number(e.target.value))}
                className="w-full px-3 py-2 bg-[#080B10] border border-emerald-500/30 text-emerald-300 rounded-xl font-bold focus:border-emerald-500 outline-none"
              />
            </div>

            <div>
              <label className="text-[11px] text-gray-400 block mb-1">Target 2 (₹)</label>
              <input
                type="number"
                step="0.05"
                value={target2}
                onChange={(e) => setTarget2(Number(e.target.value))}
                className="w-full px-3 py-2 bg-[#080B10] border border-white/10 rounded-xl text-gray-300 font-bold focus:border-cyan-500/50 outline-none"
              />
            </div>
          </div>

          {/* Position Sizing Output Card */}
          <div className="p-3.5 bg-cyan-500/10 border border-cyan-500/20 rounded-xl space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-cyan-300 font-bold flex items-center gap-1.5">
                <Calculator className="w-4 h-4 text-cyan-400" />
                Auto Position Size Recommendation
              </span>
              <span className="font-mono font-extrabold text-white text-base">
                {finalQty} Shares
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[11px] font-mono pt-1 border-t border-cyan-500/20">
              <div>
                <span className="text-gray-400 block">Capital Deployed:</span>
                <span className="text-white font-bold">₹{capitalDeployed.toLocaleString('en-IN')}</span>
                <span className="text-[9px] text-gray-400 block">({capitalUtilizationPct.toFixed(1)}% of portfolio)</span>
              </div>
              <div>
                <span className="text-gray-400 block">Max Potential Loss:</span>
                <span className="text-red-400 font-bold">₹{totalRiskRs.toLocaleString('en-IN')}</span>
                <span className="text-[9px] text-gray-400 block">(R:R = 1 : {calculatedRR})</span>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="text-[11px] text-gray-400 block mb-1">Trade Rationale / Notes</label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 bg-[#080B10] border border-white/10 rounded-xl text-gray-300 text-xs focus:border-cyan-500/50 outline-none"
            />
          </div>

          {/* Form Actions */}
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
              disabled={!isValid}
              className="flex-1 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 text-black font-bold flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 transition-all"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Confirm & Log Position</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};


