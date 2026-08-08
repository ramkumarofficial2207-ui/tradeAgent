import React, { useState, useEffect } from 'react';
import { 
  Award, 
  TrendingUp, 
  BarChart2, 
  CheckCircle2, 
  XCircle, 
  Search, 
  ShieldCheck,
  Percent,
  Layers,
  Sparkles
} from 'lucide-react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, BarChart, Bar, Cell } from 'recharts';
import { HistoricalSetup } from '../types';
import { apiJson } from '../lib/api';

export const TrackRecordPage: React.FC = () => {
  const [data, setData] = useState<{
    winRate: number;
    profitFactor: number;
    expectancyPct: number;
    maxDrawdownPct: number;
    equityCurve: Array<{ date: string; R: number; equity: number }>;
    historicalSetups: HistoricalSetup[];
  }>({
    winRate: 0,
    profitFactor: 0,
    expectancyPct: 0,
    maxDrawdownPct: 0,
    equityCurve: [],
    historicalSetups: [],
  });

  const [searchQuery, setSearchQuery] = useState<string>('');

  useEffect(() => {
    apiJson<any>('/api/performance')
      .then((d) => {
        const payload = d?.data;
        if (!payload) return;
        const history: HistoricalSetup[] = Array.isArray(payload.history) ? payload.history : [];
        let cumulativePct = 0;
        const equityCurve = history
          .filter(item => typeof item.resultPct === 'number')
          .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
          .map(item => {
            cumulativePct += item.resultPct ?? 0;
            return { date: new Date(item.createdAt).toLocaleDateString('en-IN'), R: item.resultPct ?? 0, equity: +cumulativePct.toFixed(2) };
          });
        setData({
          winRate: payload.analytics?.totals?.winRate ?? 0,
          profitFactor: payload.analytics?.totals?.profitFactor ?? 0,
          expectancyPct: payload.analytics?.totals?.expectancy ?? 0,
          maxDrawdownPct: payload.analytics?.totals?.maxDrawdown ?? 0,
          equityCurve,
          historicalSetups: history,
        });
      })
      .catch((err) => console.error(err));
  }, []);

  const safeHistory = Array.isArray(data?.historicalSetups) ? data.historicalSetups : [];

  const filteredHistory = safeHistory.filter(
    (h) =>
      h?.ticker?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      h?.setupType?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const setupTypeStats = Object.values(safeHistory.reduce<Record<string, { name: string; won: number; count: number }>>((acc, setup) => {
    if (!['WON', 'LOST'].includes(setup.status)) return acc;
    const key = setup.setupType || 'Unclassified';
    const bucket = acc[key] ?? { name: key, won: 0, count: 0 };
    bucket.count += 1;
    if (setup.status === 'WON') bucket.won += 1;
    acc[key] = bucket;
    return acc;
  }, {})).map(bucket => ({ ...bucket, winRate: bucket.count ? +((bucket.won / bucket.count) * 100).toFixed(1) : 0 }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-[#0D1117] border border-white/10 rounded-2xl p-6 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-white flex items-center gap-2">
            <Award className="w-7 h-7 text-cyan-400" />
            ApexScan Institutional Edge Track Record
          </h1>
          <p className="text-xs text-gray-400 mt-1">
            Tracked paper-signal outcomes, cumulative return, and strategy breakdown from stored records.
          </p>
        </div>

        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-mono font-bold">
          <ShieldCheck className="w-4 h-4" />
          <span>PAPER PERFORMANCE LOG</span>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 font-mono">
        <div className="bg-[#0D1117] border border-white/10 rounded-2xl p-4 shadow-xl">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider font-sans block">SYSTEM WIN RATE</span>
          <div className="text-2xl font-extrabold text-emerald-400 mt-1">
            {data.winRate}%
          </div>
          <div className="text-xs text-gray-400 mt-1 font-sans">
            Resolved stored signals only
          </div>
        </div>

        <div className="bg-[#0D1117] border border-white/10 rounded-2xl p-4 shadow-xl">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider font-sans block">PROFIT FACTOR</span>
          <div className="text-2xl font-extrabold text-cyan-300 mt-1">
            {data.profitFactor}x
          </div>
          <div className="text-xs text-gray-400 mt-1 font-sans">
            Gross Gains / Gross Losses
          </div>
        </div>

        <div className="bg-[#0D1117] border border-white/10 rounded-2xl p-4 shadow-xl">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider font-sans block">EXPECTANCY</span>
          <div className="text-2xl font-extrabold text-white mt-1">
            {data.expectancyPct}%
          </div>
          <div className="text-xs text-emerald-400 mt-1 font-sans">
            Average outcome per resolved signal
          </div>
        </div>

        <div className="bg-[#0D1117] border border-white/10 rounded-2xl p-4 shadow-xl">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider font-sans block">MAX SYSTEM DRAWDOWN</span>
          <div className="text-2xl font-extrabold text-amber-400 mt-1">
            {data.maxDrawdownPct}%
          </div>
          <div className="text-xs text-gray-400 mt-1 font-sans">
            Peak-to-trough capital risk
          </div>
        </div>
      </div>

      {/* Performance Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Cumulative System Equity Curve (7 cols) */}
        <div className="lg:col-span-7 bg-[#0D1117] border border-white/10 rounded-2xl p-5 shadow-xl space-y-3">
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-400" />
              Cumulative Recorded Return (%)
            </h3>
            <span className="text-xs font-mono text-cyan-400 font-bold">No capital curve is inferred</span>
          </div>

          <div className="h-64 w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.equityCurve || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
                <XAxis dataKey="date" stroke="#9CA3AF" fontSize={11} tickLine={false} />
                <YAxis stroke="#9CA3AF" fontSize={11} tickLine={false} domain={['auto', 'auto']} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0D1117', borderColor: '#ffffff20', borderRadius: '12px' }}
                  formatter={(val: any) => [`${Number(val).toFixed(2)}%`, 'Cumulative Return']}
                />
                <Line
                  type="monotone"
                  dataKey="equity"
                  stroke="#10B981"
                  strokeWidth={3}
                  dot={{ fill: '#10B981', r: 4 }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Win-Rate Breakdown by Setup Type (5 cols) */}
        <div className="lg:col-span-5 bg-[#0D1117] border border-white/10 rounded-2xl p-5 shadow-xl space-y-3">
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <BarChart2 className="w-4 h-4 text-cyan-400" />
              Win-Rate % by Setup Archetype
            </h3>
          </div>

          <div className="h-64 w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={setupTypeStats} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
                <XAxis type="number" domain={[0, 100]} stroke="#9CA3AF" fontSize={11} />
                <YAxis dataKey="name" type="category" stroke="#9CA3AF" fontSize={10} width={130} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0D1117', borderColor: '#ffffff20', borderRadius: '12px' }}
                  formatter={(val: any) => [`${val}% Win Rate`, 'Performance']}
                />
                <Bar dataKey="winRate" radius={[0, 8, 8, 0]}>
                  {setupTypeStats.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={index === 0 ? '#10B981' : index === 1 ? '#06B6D4' : '#F59E0B'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Verified Historical Signal History Audit Log */}
      <div className="bg-[#0D1117] border border-white/10 rounded-2xl p-5 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-white/10 pb-3">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-cyan-400" />
            Verified Historical Signal Audit Log
          </h2>

          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search historical ticker..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-[#080B10] border border-white/10 rounded-xl text-xs text-white placeholder-gray-500 focus:border-cyan-500/50 outline-none"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs font-mono">
            <thead>
              <tr className="bg-[#080B10] text-gray-400 text-[11px] border-b border-white/10 uppercase tracking-wider">
                <th className="p-3 font-semibold">Ticker & Setup</th>
                <th className="p-3 font-semibold">Entry / Target / SL</th>
                <th className="p-3 font-semibold">AI Thesis Rationale</th>
                <th className="p-3 font-semibold">Result Status</th>
                <th className="p-3 font-semibold text-right">Return %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filteredHistory.map((h) => {
                const isWon = h.status === 'WON';
                return (
                  <tr key={h.id} className="hover:bg-white/5 transition-colors">
                    <td className="p-3">
                      <div className="font-bold text-white">{h.ticker}</div>
                      <div className="text-[10px] text-gray-400 font-sans">{h.setupType}</div>
                    </td>

                    <td className="p-3 text-gray-300">
                      ₹{h.entryPrice} ➔ ₹{h.targetPrice} (SL ₹{h.stopLoss})
                    </td>

                    <td className="p-3 text-gray-400 font-sans max-w-xs truncate">
                      {h.aiLogic}
                    </td>

                    <td className="p-3">
                      <span
                        className={`px-2.5 py-1 rounded-lg font-bold text-[10px] border ${
                          isWon
                            ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                            : 'bg-red-500/15 text-red-300 border-red-500/30'
                        }`}
                      >
                        {h.status}
                      </span>
                    </td>

                    <td className="p-3 text-right font-bold text-sm">
                      <span className={isWon ? 'text-emerald-400' : 'text-red-400'}>
                        {isWon ? '+' : ''}{h.resultPct}%
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};


