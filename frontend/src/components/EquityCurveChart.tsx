import React, { useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';

export const EquityCurveChart = ({ history }: { history: any[] }) => {
    // Calculate the compounding equity curve
    const data = useMemo(() => {
        // Sort history chronologically (oldest first)
        const resolvedTrades = [...(history || [])]
            .filter(t => t.status === 'WON' || t.status === 'LOST')
            .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

        if (resolvedTrades.length === 0) return [];

        let currentCapital = 100000; // Start with ₹1,00,000
        const curve: any[] = [{ name: 'Start', capital: currentCapital, trade: null, result: 0 }];

        resolvedTrades.forEach((trade, i) => {
            const riskPerTrade = currentCapital * 0.02; // Risk 2% of current capital

            // Calculate Stop Loss % width from entry
            const entry = trade.entryPrice;
            const sl = trade.stopLoss;
            let slPct = ((entry - sl) / entry) * 100;
            if (slPct <= 0 || isNaN(slPct)) slPct = 2; // Fallback 2% sl

            // Position Size = Risk / SL%
            const positionSize = riskPerTrade / (slPct / 100);

            // P&L = Position Size * Result %
            const resultPct = trade.resultPct || 0;
            const profitLoss = positionSize * (resultPct / 100);

            currentCapital += profitLoss;

            curve.push({
                name: `T${i + 1}`,
                capital: Math.round(currentCapital),
                trade: trade.ticker,
                result: resultPct,
            });
        });

        return curve;
    }, [history]);

    if (data.length < 2) return null;

    const netProfit = data[data.length - 1].capital - 100000;
    const isProfitable = netProfit >= 0;

    return (
        <div className="card" style={{ padding: '24px', marginBottom: '24px', background: 'var(--bg-card)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
                <div>
                    <h3 style={{ fontSize: '1.2rem', fontFamily: 'var(--font-display)', fontWeight: 800, margin: 0 }}>Simulated P&L Visualizer</h3>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>
                        Modeling a ₹1,00,000 starting portfolio, compounding visually with strict 2% account risk per trade over the AI's historic track record.
                    </p>
                </div>
                <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '0.65rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 800, marginBottom: 2 }}>Net Projected Profit</div>
                    <div style={{
                        fontSize: '1.6rem', fontFamily: 'var(--font-mono)', fontWeight: 900,
                        color: isProfitable ? '#34d399' : '#f87171'
                    }}>
                        {isProfitable ? '+' : ''}₹{Math.abs(netProfit).toLocaleString('en-IN')}
                    </div>
                </div>
            </div>

            <div style={{ height: 260, width: '100%', marginTop: 10 }}>
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <defs>
                            <linearGradient id="colorCapital" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor={isProfitable ? '#34d399' : '#f87171'} stopOpacity={0.3} />
                                <stop offset="95%" stopColor={isProfitable ? '#34d399' : '#f87171'} stopOpacity={0.0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                        <XAxis
                            dataKey="name"
                            stroke="var(--text-muted)"
                            fontSize={11}
                            tickLine={false}
                            axisLine={false}
                        />
                        <YAxis
                            stroke="var(--text-muted)"
                            fontSize={11}
                            tickFormatter={(val) => `₹${(val / 1000).toFixed(0)}k`}
                            tickLine={false}
                            axisLine={false}
                            domain={['dataMin - 5000', 'dataMax + 5000']}
                        />
                        <Tooltip
                            contentStyle={{
                                backgroundColor: 'var(--bg-card)',
                                borderColor: 'var(--border)',
                                borderRadius: 8,
                                boxShadow: '0 8px 24px rgba(0,0,0,0.12)'
                            }}
                            itemStyle={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontWeight: 700 }}
                            labelStyle={{ color: 'var(--text-secondary)', marginBottom: 4 }}
                            formatter={(value: any, name: any) => [`₹${value.toLocaleString('en-IN')}`, 'Portfolio Value']}
                            labelFormatter={(label: any, payload: any) => {
                                if (payload && payload[0]?.payload?.trade) {
                                    const p = payload[0].payload;
                                    return `${label} — ${p.trade} (${p.result > 0 ? '+' : ''}${p.result}%)`;
                                }
                                return label;
                            }}
                        />
                        <ReferenceLine y={100000} stroke="var(--text-muted)" strokeDasharray="3 3" />
                        <Area
                            type="monotone"
                            dataKey="capital"
                            stroke={isProfitable ? '#34d399' : '#f87171'}
                            strokeWidth={3}
                            fillOpacity={1}
                            fill="url(#colorCapital)"
                            animationDuration={1500}
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};
