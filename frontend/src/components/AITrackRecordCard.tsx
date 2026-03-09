import React, { useState } from 'react';
import { Bot, ChevronDown, ChevronUp } from 'lucide-react';

export const AITrackRecordCard = ({ trade }: { trade: any }) => {
    const [expanded, setExpanded] = useState(false);

    const isWon = trade.status === 'WON';
    const isLost = trade.status === 'LOST';
    const stampColor = isWon ? '#34d399' : isLost ? '#f87171' : '#fbbf24';

    return (
        <div className="card" style={{ padding: '16px', position: 'relative', overflow: 'hidden' }}>
            {/* Historic Stamp */}
            <div style={{
                position: 'absolute', top: 20, right: -30, transform: 'rotate(25deg)',
                border: `3px solid ${stampColor}`, color: stampColor,
                padding: '4px 20px', fontSize: '1.1rem', fontWeight: 900, fontFamily: 'var(--font-display)',
                opacity: 0.15, textTransform: 'uppercase', pointerEvents: 'none'
            }}>
                {trade.status.replace('_', ' ')}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', fontWeight: 900 }}>{trade.ticker}</div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{trade.setupType} &middot; {new Date(trade.createdAt).toLocaleDateString()}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                    <span style={{ fontSize: '0.58rem', fontWeight: 700, color: '#a78bfa', background: 'rgba(167,139,250,0.12)', padding: '2px 8px', borderRadius: 99 }}>
                        {trade.timeframe || 'Swing Trade'}
                    </span>
                    <div style={{ fontSize: '0.68rem', fontWeight: 800, marginTop: 6, color: 'var(--text-secondary)' }}>
                        Score: {trade.confidenceScore}/10
                    </div>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, background: 'var(--bg-hover)', padding: '10px', borderRadius: 8, marginBottom: 12 }}>
                <div>
                    <div style={{ fontSize: '0.54rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Entry</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', fontWeight: 800 }}>₹{trade.entryPrice}</div>
                </div>
                <div>
                    <div style={{ fontSize: '0.54rem', color: '#34d399', textTransform: 'uppercase' }}>Target</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', fontWeight: 800 }}>₹{trade.targetPrice}</div>
                </div>
                <div>
                    <div style={{ fontSize: '0.54rem', color: '#f87171', textTransform: 'uppercase' }}>Stop</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', fontWeight: 800 }}>₹{trade.stopLoss}</div>
                </div>
            </div>

            {(trade.resultPct != null || trade.aiLogic) && (
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 4 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        {trade.resultPct != null && (
                            <span style={{ color: stampColor, fontWeight: 800, fontFamily: 'var(--font-mono)', fontSize: '0.9rem' }}>
                                Result: {trade.resultPct > 0 ? '+' : ''}{trade.resultPct}%
                            </span>
                        )}

                        {trade.aiLogic && (
                            <button
                                onClick={() => setExpanded(!expanded)}
                                style={{
                                    background: 'none', border: 'none', cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', gap: 4,
                                    color: 'var(--text-secondary)', fontSize: '0.7rem', fontWeight: 600
                                }}
                            >
                                <Bot size={12} color="#8b5cf6" />
                                {expanded ? 'Hide Logic' : 'Why this trade?'}
                                {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                            </button>
                        )}
                    </div>

                    {expanded && trade.aiLogic && (
                        <div style={{
                            marginTop: 12, padding: 12, borderRadius: 8,
                            background: 'rgba(139,92,246,0.05)', border: '1px solid rgba(139,92,246,0.15)',
                            fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.5
                        }}>
                            <div style={{ fontWeight: 700, color: '#a78bfa', marginBottom: 4, fontSize: '0.65rem', textTransform: 'uppercase' }}>Claude AI Reasoning</div>
                            {trade.aiLogic}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
