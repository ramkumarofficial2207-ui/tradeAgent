import React, { useState, useEffect } from 'react';
import { 
  Briefcase, 
  ShieldAlert, 
  TrendingUp, 
  TrendingDown, 
  Sliders, 
  XCircle, 
  CheckCircle2, 
  Award,
  DollarSign,
  AlertTriangle
} from 'lucide-react';
import { Trade, User } from '../types';
import { apiJson } from '../lib/api';
import { normalizePortfolioRisk, PortfolioRiskViewModel } from '../lib/portfolioViewModel';

interface PortfolioPageProps {
  user: User;
  trades: Trade[];
  onOpenExitModal: (trade: Trade) => void;
  onUpdateTrailingStop: (tradeId: string, newStop: number) => void;
}

export const PortfolioPage: React.FC<PortfolioPageProps> = ({
  user,
  trades = [],
  onOpenExitModal,
  onUpdateTrailingStop,
}) => {
  const safeTrades = Array.isArray(trades) ? trades : [];

  const [intelligence, setIntelligence] = useState<PortfolioRiskViewModel>(() => normalizePortfolioRisk(null));

  useEffect(() => {
    apiJson<any>('/api/portfolio/intelligence')
      .then((data) => {
        setIntelligence(normalizePortfolioRisk(data?.data));
      })
      .catch((err) => console.error(err));
  }, [safeTrades]);

  const openTrades = safeTrades.filter((t) => t.status === 'OPEN');
  const closedTrades = safeTrades.filter((t) => t.status === 'CLOSED');

  const totalCapital = user.tradingCapital || 0;
  const investedCapital = openTrades.reduce((sum, t) => sum + (t.capitalDeployed || t.entryPrice * t.quantity), 0);
  const capitalUtilizationPct = totalCapital > 0 ? (investedCapital / totalCapital) * 100 : 0;

  const unrealizedPnl = openTrades.reduce((sum, t) => {
    const cur = t.currentPrice || t.entryPrice;
    return sum + (cur - t.entryPrice) * t.quantity;
  }, 0);

  const wonTrades = closedTrades.filter((t) => (t.pnlRs || 0) > 0);
  const winRate = closedTrades.length > 0 ? (wonTrades.length / closedTrades.length) * 100 : 0;

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="bg-[#0D1117] border border-white/10 rounded-2xl p-6 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-white flex items-center gap-2">
            <Briefcase className="w-7 h-7 text-cyan-400" />
            Portfolio Risk Governor & Trade Tracker
          </h1>
          <p className="text-xs text-gray-400 mt-1">
            Real-time open position monitoring, trailing stop loss governor, and account risk exposure analysis.
          </p>
        </div>

        <div className="flex items-center gap-3 font-mono text-xs">
          <div className="px-3 py-1.5 rounded-xl bg-[#080B10] border border-white/10 text-gray-300">
            Portfolio Capital: <strong className="text-white font-bold">₹{totalCapital.toLocaleString('en-IN')}</strong>
          </div>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 font-mono">
        {/* Total Deployed Capital */}
        <div className="bg-[#0D1117] border border-white/10 rounded-2xl p-4 shadow-xl">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider font-sans block">CAPITAL DEPLOYMENT</span>
          <div className="text-xl font-extrabold text-white mt-1">
            ₹{investedCapital.toLocaleString('en-IN')}
          </div>
          <div className="text-xs text-cyan-400 mt-1">
            {capitalUtilizationPct.toFixed(1)}% Capital Utilized
          </div>
        </div>

        {/* Unrealized P&L */}
        <div className="bg-[#0D1117] border border-white/10 rounded-2xl p-4 shadow-xl">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider font-sans block">OPEN UNREALIZED P&L</span>
          <div className={`text-xl font-extrabold mt-1 ${unrealizedPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {unrealizedPnl >= 0 ? '+' : ''}₹{unrealizedPnl.toLocaleString('en-IN')}
          </div>
          <div className="text-xs text-gray-400 mt-1">
            Across {openTrades.length} Active Positions
          </div>
        </div>

        {/* Win Rate */}
        <div className="bg-[#0D1117] border border-white/10 rounded-2xl p-4 shadow-xl">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider font-sans block">SYSTEM WIN RATE</span>
          <div className="text-xl font-extrabold text-cyan-300 mt-1">
            {winRate.toFixed(1)}%
          </div>
          <div className="text-xs text-gray-400 mt-1">
            {wonTrades.length} Won / {closedTrades.length} Closed
          </div>
        </div>

        {/* Risk Exposure */}
        <div className="bg-[#0D1117] border border-white/10 rounded-2xl p-4 shadow-xl">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider font-sans block">TOTAL ACCOUNT RISK</span>
          <div className="text-xl font-extrabold text-amber-400 mt-1">
            ₹{intelligence.totalCapitalRiskRs.toLocaleString('en-IN')}
          </div>
          <div className="text-xs text-amber-300/80 mt-1">
            {intelligence.capitalRiskPct}% Max Capital at Risk
          </div>
        </div>
      </div>

      {/* Portfolio Intelligence & Risk Warning Banner */}
      {intelligence.warnings && intelligence.warnings.length > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 shadow-xl space-y-2">
          <div className="flex items-center gap-2 text-amber-400 font-bold text-xs">
            <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0" />
            <span>PORTFOLIO RISK GOVERNOR ALERTS</span>
          </div>
          <ul className="space-y-1 text-xs text-amber-200/90 pl-7 list-disc">
            {intelligence.warnings.map((warn, idx) => (
              <li key={idx}>{warn}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Open Positions Section */}
      <div className="bg-[#0D1117] border border-white/10 rounded-2xl p-5 shadow-xl space-y-4">
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Sliders className="w-5 h-5 text-emerald-400" />
            Active Open Positions
            <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 font-mono text-xs font-bold">
              {openTrades.length} Active
            </span>
          </h2>
        </div>

        {openTrades.length === 0 ? (
          <div className="p-8 text-center text-gray-400 space-y-2 font-sans">
            <Briefcase className="w-10 h-10 text-gray-500 mx-auto" />
            <p className="text-sm font-semibold text-gray-300">No active open positions in portfolio.</p>
            <p className="text-xs text-gray-500">Log paper trades from the Dashboard or Watchlist scanner.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-[#080B10] text-gray-400 font-mono text-[11px] border-b border-white/10 uppercase tracking-wider">
                  <th className="p-3 font-semibold">Ticker & Sector</th>
                  <th className="p-3 font-semibold">Entry / Qty</th>
                  <th className="p-3 font-semibold">Current LTP</th>
                  <th className="p-3 font-semibold">Trailing Stop Loss</th>
                  <th className="p-3 font-semibold">Target 1</th>
                  <th className="p-3 font-semibold">Unrealized P&L</th>
                  <th className="p-3 font-semibold text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 font-mono">
                {openTrades.map((t) => {
                  const currentLtp = t.currentPrice || t.entryPrice;
                  const pnl = (currentLtp - t.entryPrice) * t.quantity;
                  const pnlPct = ((currentLtp - t.entryPrice) / t.entryPrice) * 100;
                  const isUp = pnl >= 0;

                  return (
                    <tr key={t.id} className="hover:bg-white/5 transition-colors">
                      <td className="p-3">
                        <div className="font-bold text-white text-sm">{t.ticker}</div>
                        <div className="text-[10px] text-gray-400 font-sans">{t.sector} • {t.setupType}</div>
                      </td>

                      <td className="p-3">
                        <div className="text-gray-200 font-bold">₹{t.entryPrice.toLocaleString('en-IN')}</div>
                        <div className="text-[10px] text-gray-400">{t.quantity} Shares (₹{(t.capitalDeployed || 0).toLocaleString('en-IN')})</div>
                      </td>

                      <td className="p-3">
                        <div className="text-white font-bold text-sm">₹{currentLtp.toLocaleString('en-IN')}</div>
                      </td>

                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            step="0.5"
                            value={t.stopLossTrail || t.stopLossInit}
                            onChange={(e) => onUpdateTrailingStop(t.id, Number(e.target.value))}
                            className="w-24 px-2 py-1 bg-[#080B10] border border-amber-500/30 text-amber-300 font-bold rounded text-xs"
                          />
                          <span className="text-[9px] text-gray-400 font-sans">Adjust Stop</span>
                        </div>
                      </td>

                      <td className="p-3 text-emerald-400 font-bold">
                        ₹{t.target1.toLocaleString('en-IN')}
                      </td>

                      <td className="p-3">
                        <div className={`font-bold text-sm ${isUp ? 'text-emerald-400' : 'text-red-400'}`}>
                          {isUp ? '+' : ''}₹{pnl.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                        </div>
                        <div className={`text-[10px] ${isUp ? 'text-emerald-400' : 'text-red-400'}`}>
                          ({isUp ? '+' : ''}{pnlPct.toFixed(2)}%)
                        </div>
                      </td>

                      <td className="p-3 text-right font-sans">
                        <button
                          onClick={() => onOpenExitModal(t)}
                          className="px-3 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 text-xs font-semibold flex items-center justify-end gap-1 ml-auto transition-all"
                        >
                          <XCircle className="w-3.5 h-3.5 text-amber-400" />
                          <span>Close Position</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Closed Trades Log Section */}
      <div className="bg-[#0D1117] border border-white/10 rounded-2xl p-5 shadow-xl space-y-4">
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Award className="w-5 h-5 text-cyan-400" />
            Closed Trade Execution Log
          </h2>
        </div>

        {closedTrades.length === 0 ? (
          <div className="p-6 text-center text-gray-500 text-xs">
            No closed trade history yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-[#080B10] text-gray-400 font-mono text-[11px] border-b border-white/10 uppercase tracking-wider">
                  <th className="p-3 font-semibold">Ticker</th>
                  <th className="p-3 font-semibold">Entry / Exit</th>
                  <th className="p-3 font-semibold">Exit Reason</th>
                  <th className="p-3 font-semibold">Realized P&L</th>
                  <th className="p-3 font-semibold">R-Multiple</th>
                  <th className="p-3 font-semibold">Hold Duration</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 font-mono">
                {closedTrades.map((t) => {
                  const isWon = (t.pnlRs || 0) > 0;
                  return (
                    <tr key={t.id} className="hover:bg-white/5 transition-colors">
                      <td className="p-3">
                        <div className="font-bold text-white">{t.ticker}</div>
                        <div className="text-[10px] text-gray-400">{t.setupType}</div>
                      </td>

                      <td className="p-3 text-gray-300">
                        ₹{t.entryPrice} ➔ ₹{t.exitPrice}
                      </td>

                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-white/5 text-gray-300 border border-white/10">
                          {t.exitReason}
                        </span>
                      </td>

                      <td className="p-3">
                        <div className={`font-bold ${isWon ? 'text-emerald-400' : 'text-red-400'}`}>
                          {isWon ? '+' : ''}₹{(t.pnlRs || 0).toLocaleString('en-IN')}
                        </div>
                      </td>

                      <td className="p-3">
                        <span className={`font-bold ${isWon ? 'text-emerald-400' : 'text-red-400'}`}>
                          {(t.rMultiple || 0) >= 0 ? '+' : ''}{t.rMultiple}R
                        </span>
                      </td>

                      <td className="p-3 text-gray-400">
                        {t.daysHeld || 1} Days
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

