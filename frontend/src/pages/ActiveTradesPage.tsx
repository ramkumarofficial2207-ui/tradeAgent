import { useState, useEffect } from 'react';

// Simulated trades interface
interface Trade {
    id: string;
    ticker: string;
    entryPrice: number;
    currentPrice: number;
    quantity: number;
    target: number;
    stopLoss: number;
    status: 'active' | 'closed';
    pnl: number;
    pnlPercentage: number;
    timeOpen: string;
}

export default function ActiveTradesPage() {
    const [trades, setTrades] = useState<Trade[]>([]);

    // Simulate fetching active trades data
    useEffect(() => {
        const mockTrades: Trade[] = [
            {
                id: 'tr_1',
                ticker: 'RELIANCE',
                entryPrice: 2840.50,
                currentPrice: 2895.00,
                quantity: 50,
                target: 3100.00,
                stopLoss: 2790.00,
                status: 'active',
                pnl: 2725.00,
                pnlPercentage: 1.91,
                timeOpen: '3 days ago'
            },
            {
                id: 'tr_2',
                ticker: 'HDFCBANK',
                entryPrice: 1420.00,
                currentPrice: 1405.00,
                quantity: 100,
                target: 1550.00,
                stopLoss: 1380.00,
                status: 'active',
                pnl: -1500.00,
                pnlPercentage: -1.05,
                timeOpen: '1 day ago'
            },
            {
                id: 'tr_3',
                ticker: 'TCS',
                entryPrice: 3850.00,
                currentPrice: 4010.00,
                quantity: 25,
                target: 4150.00,
                stopLoss: 3750.00,
                status: 'active',
                pnl: 4000.00,
                pnlPercentage: 4.15,
                timeOpen: '5 days ago'
            }
        ];
        setTrades(mockTrades);
    }, []);

    const totalPnl = trades.reduce((sum, trade) => sum + trade.pnl, 0);
    const totalInvested = trades.reduce((sum, trade) => sum + (trade.entryPrice * trade.quantity), 0);
    const portfolioReturn = (totalPnl / totalInvested) * 100;

    return (
        <div className="p-8 h-full flex flex-col">
            <div className="flex justify-between items-end mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-white mb-2">Active Trades</h1>
                    <p className="text-gray-400">Monitor your open positions and live P&L.</p>
                </div>

                <div className="flex gap-4">
                    <div className="px-6 py-3 bg-[#1e1e24] border border-[#2d2d35] rounded-xl flex flex-col items-end">
                        <span className="text-gray-400 text-sm font-medium">Invested Value</span>
                        <span className="text-white font-bold text-lg">₹{totalInvested.toLocaleString()}</span>
                    </div>
                    <div className={`px-6 py-3 border rounded-xl flex flex-col items-end ${totalPnl >= 0 ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-red-500/10 border-red-500/20'}`}>
                        <span className={`${totalPnl >= 0 ? 'text-emerald-400' : 'text-red-400'} text-sm font-medium`}>Today's P&L</span>
                        <span className={`${totalPnl >= 0 ? 'text-emerald-400' : 'text-red-400'} font-bold text-lg`}>
                            {totalPnl >= 0 ? '+' : ''}₹{totalPnl.toLocaleString()} ({portfolioReturn.toFixed(2)}%)
                        </span>
                    </div>
                </div>
            </div>

            <div className="flex-1 bg-[#1e1e24] border border-[#2d2d35] rounded-2xl shadow-lg overflow-hidden flex flex-col">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b border-[#2d2d35] text-gray-400 text-sm uppercase tracking-wider">
                                <th className="p-4 font-semibold pb-4">Symbol</th>
                                <th className="p-4 font-semibold pb-4">Quantity</th>
                                <th className="p-4 font-semibold pb-4">Avg. Price</th>
                                <th className="p-4 font-semibold pb-4">LTP</th>
                                <th className="p-4 font-semibold pb-4">Target / SL</th>
                                <th className="p-4 font-semibold pb-4 text-right">P&L</th>
                                <th className="p-4 font-semibold pb-4 text-center">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[#2d2d35]/50">
                            {trades.map((trade) => (
                                <tr key={trade.id} className="hover:bg-[#26262d] transition-colors group">
                                    <td className="p-4">
                                        <div className="font-bold text-white">{trade.ticker}</div>
                                        <div className="text-xs text-gray-500 mt-1">{trade.timeOpen}</div>
                                    </td>
                                    <td className="p-4 text-gray-300 font-medium">{trade.quantity}</td>
                                    <td className="p-4 text-gray-300">₹{trade.entryPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                    <td className={`p-4 font-medium ${trade.currentPrice >= trade.entryPrice ? 'text-emerald-400' : 'text-red-400'}`}>
                                        ₹{trade.currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </td>
                                    <td className="p-4">
                                        <div className="flex flex-col gap-1">
                                            <span className="text-blue-400 text-sm font-medium">T: ₹{trade.target.toLocaleString()}</span>
                                            <span className="text-red-400 text-sm font-medium">S: ₹{trade.stopLoss.toLocaleString()}</span>
                                        </div>
                                    </td>
                                    <td className="p-4 text-right">
                                        <div className={`font-bold ${trade.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                            {trade.pnl >= 0 ? '+' : ''}₹{trade.pnl.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                        </div>
                                        <div className={`text-xs mt-1 ${trade.pnlPercentage >= 0 ? 'text-emerald-500/80' : 'text-red-500/80'}`}>
                                            {trade.pnlPercentage >= 0 ? '+' : ''}{trade.pnlPercentage.toFixed(2)}%
                                        </div>
                                    </td>
                                    <td className="p-4 text-center">
                                        <button className="bg-[#2d2d35] hover:bg-[#3a3a45] text-white px-4 py-2 rounded-lg text-sm font-medium border border-[#3f3f4e] transition-colors opacity-0 group-hover:opacity-100">
                                            Exit Position
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {trades.length === 0 && (
                                <tr>
                                    <td colSpan={7} className="p-12 text-center text-gray-500">
                                        No active trades currently open.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
