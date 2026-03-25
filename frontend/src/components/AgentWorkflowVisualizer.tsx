/* ─── AgentWorkflowVisualizer.tsx — Visual scan pipeline ─── */
import { Cpu, Database, BarChart3, Brain, CheckCircle2, Shield, Loader2, Clock, Zap, Target, Eye } from 'lucide-react'
import type { ThinkingStep, AgentStatus } from '../lib/useAgentSSE'

interface StageInfo {
    id: string
    label: string
    detail: string
    icon: React.ReactNode
    color: string
}

const PIPELINE_STAGES: StageInfo[] = [
    { id: 'fetch', label: 'Data Fetch', detail: 'NSE + Yahoo Finance', icon: <Database size={16} />, color: '#3b82f6' },
    { id: 'tech', label: 'Technicals', detail: 'DMA, RSI, EMA, Volume', icon: <BarChart3 size={16} />, color: '#8b5cf6' },
    { id: 'ai', label: 'AI Analysis', detail: 'Gemini 1.5 Pro', icon: <Brain size={16} />, color: '#06b6d4' },
    { id: 'eval', label: 'Evaluation', detail: 'Score & Rank Setups', icon: <Target size={16} />, color: '#f59e0b' },
    { id: 'output', label: 'Output', detail: 'Generate Trade Cards', icon: <Zap size={16} />, color: '#10b981' },
]

function getStageStatus(stageIdx: number, thinkingSteps: ThinkingStep[], agentState: string): 'idle' | 'running' | 'done' {
    if (agentState !== 'SCANNING') {
        // If not scanning, check if we have completed thinking steps
        if (thinkingSteps.length === 0) return 'idle'
        const allDone = thinkingSteps.every(s => s.status === 'done')
        if (allDone) return 'done'
    }

    // Map thinking steps to stages
    const doneCount = thinkingSteps.filter(s => s.status === 'done').length
    const runningExists = thinkingSteps.some(s => s.status === 'running')

    if (stageIdx < doneCount) return 'done'
    if (stageIdx === doneCount && runningExists) return 'running'
    if (stageIdx === doneCount && !runningExists && agentState === 'SCANNING') return 'running'
    return 'idle'
}

export default function AgentWorkflowVisualizer({ status, thinkingSteps }: { status: AgentStatus | null; thinkingSteps: ThinkingStep[] }) {
    const agentState = status?.state || 'IDLE'
    const isScanning = agentState === 'SCANNING'
    const hasResults = thinkingSteps.length > 0 && thinkingSteps.every(s => s.status === 'done')

    return (
        <div style={{
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: 16, padding: '18px 22px', overflow: 'hidden',
        }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{
                        width: 28, height: 28, borderRadius: 8,
                        background: isScanning ? 'linear-gradient(135deg, rgba(139,92,246,0.2), rgba(59,130,246,0.1))' : 'var(--bg-elevated)',
                        border: isScanning ? '1px solid rgba(139,92,246,0.3)' : '1px solid var(--border)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                        <Cpu size={13} style={{ color: isScanning ? '#a78bfa' : 'var(--text-muted)' }} />
                    </div>
                    <div>
                        <div style={{ fontFamily: 'var(--font-display)', fontSize: '0.82rem', fontWeight: 800, letterSpacing: '-0.01em' }}>Scan Pipeline</div>
                        <div style={{ fontSize: '0.56rem', color: 'var(--text-muted)' }}>
                            {isScanning ? 'Processing...' : hasResults ? 'Scan complete' : 'Waiting for scan'}
                        </div>
                    </div>
                </div>
                {isScanning && (
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: 4,
                        padding: '3px 8px', borderRadius: 99,
                        background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.25)',
                        fontSize: '0.56rem', fontWeight: 700, color: '#a78bfa',
                    }}>
                        <Loader2 size={9} style={{ animation: 'spin 1s linear infinite' }} /> Active
                    </div>
                )}
                {hasResults && (
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: 4,
                        padding: '3px 8px', borderRadius: 99,
                        background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.25)',
                        fontSize: '0.56rem', fontWeight: 700, color: '#34d399',
                    }}>
                        <CheckCircle2 size={9} /> Done
                    </div>
                )}
            </div>

            {/* Pipeline stages */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 0, position: 'relative' }}>
                {PIPELINE_STAGES.map((stage, i) => {
                    const stageStatus = getStageStatus(i, thinkingSteps, agentState)
                    const isDone = stageStatus === 'done'
                    const isRunning = stageStatus === 'running'
                    const opacity = isDone ? 1 : isRunning ? 1 : 0.4

                    return (
                        <div key={stage.id} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
                            {/* Connector line */}
                            {i > 0 && (
                                <div style={{
                                    position: 'absolute', top: 17, right: '50%', left: '-50%', height: 2,
                                    background: isDone ? `linear-gradient(90deg, ${PIPELINE_STAGES[i - 1].color}, ${stage.color})` : 'var(--bg-hover)',
                                    zIndex: 0, transition: 'background 0.5s',
                                }} />
                            )}

                            {/* Node */}
                            <div style={{
                                width: 34, height: 34, borderRadius: 10,
                                background: isDone ? `${stage.color}1A` : isRunning ? `${stage.color}1A` : 'var(--bg-elevated)',
                                border: `1.5px solid ${isDone || isRunning ? stage.color + '40' : 'var(--border)'}`,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                color: isDone || isRunning ? stage.color : 'var(--text-muted)',
                                position: 'relative', zIndex: 1, transition: 'all 0.3s',
                                boxShadow: isRunning ? `0 0 16px ${stage.color}30` : isDone ? `0 0 8px ${stage.color}15` : 'none',
                                animation: isRunning ? 'pulse 1.5s ease-in-out infinite' : 'none',
                            }}>
                                {isDone ? <CheckCircle2 size={15} /> : isRunning ? <Loader2 size={15} style={{ animation: 'spin 1.2s linear infinite' }} /> : stage.icon}
                            </div>

                            {/* Label */}
                            <div style={{ textAlign: 'center', marginTop: 8, opacity, transition: 'opacity 0.3s' }}>
                                <div style={{ fontSize: '0.62rem', fontWeight: 800, color: isDone || isRunning ? stage.color : 'var(--text-secondary)', transition: 'color 0.3s' }}>{stage.label}</div>
                                <div style={{ fontSize: '0.48rem', color: 'var(--text-muted)', marginTop: 1, lineHeight: 1.3 }}>{stage.detail}</div>
                            </div>
                        </div>
                    )
                })}
            </div>

            {/* Active thinking step detail */}
            {thinkingSteps.length > 0 && (
                <div style={{
                    marginTop: 14, padding: '10px 12px',
                    background: 'var(--bg-elevated)', borderRadius: 10, border: '1px solid var(--border)',
                }}>
                    <div style={{ fontSize: '0.56rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Eye size={9} /> Step Details
                    </div>
                    {thinkingSteps.map((step, i) => (
                        <div key={step.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, animation: `fadeUp 0.15s ease ${i * 0.05}s both` }}>
                            <span style={{ flexShrink: 0 }}>
                                {step.status === 'done' ? <CheckCircle2 size={10} style={{ color: '#34d399' }} /> :
                                    step.status === 'running' ? <Loader2 size={10} style={{ color: '#a78bfa', animation: 'spin 1s linear infinite' }} /> :
                                        <Clock size={10} style={{ color: 'var(--text-muted)' }} />}
                            </span>
                            <span style={{ fontSize: '0.68rem', fontWeight: 600, color: step.status === 'done' ? '#34d399' : step.status === 'running' ? 'var(--text-primary)' : 'var(--text-muted)', flex: 1 }}>{step.step}</span>
                            {step.detail && <span style={{ fontSize: '0.56rem', color: 'var(--text-muted)', flexShrink: 0, fontFamily: 'var(--font-mono)' }}>{step.detail}</span>}
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
