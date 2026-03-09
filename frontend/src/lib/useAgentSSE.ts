/* ─── useAgentSSE.ts — Real-time hook for agentic AI event stream ─── */
import { useState, useEffect, useRef, useCallback } from 'react'

export interface AgentEvent {
    id: string
    type: string
    severity: 'info' | 'success' | 'warning' | 'critical'
    title: string
    detail: string
    ticker?: string
    data?: Record<string, unknown>
    timestamp: string
    read: boolean
}

export interface ThinkingStep {
    id: string
    step: string
    status: 'pending' | 'running' | 'done' | 'error'
    detail?: string
    timestamp: string
}

export interface AgentStatus {
    state: 'IDLE' | 'SCANNING' | 'ANALYZING' | 'MONITORING' | 'ALERTING'
    currentTask: string | null
    tasksCompleted: number
    uptime: string
    lastScanAt: string | null
    nextScanAt: string | null
    monitoredStocks: number
    activeAlerts: number
    thinkingSteps: ThinkingStep[]
}

export function useAgentSSE() {
    const [status, setStatus] = useState<AgentStatus | null>(null)
    const [events, setEvents] = useState<AgentEvent[]>([])
    const [thinkingSteps, setThinkingSteps] = useState<ThinkingStep[]>([])
    const [connected, setConnected] = useState(false)
    const [unreadCount, setUnreadCount] = useState(0)
    const esRef = useRef<EventSource | null>(null)

    useEffect(() => {
        const es = new EventSource('/api/agent/stream')
        esRef.current = es

        es.onopen = () => setConnected(true)

        es.onmessage = (e) => {
            try {
                const msg = JSON.parse(e.data)
                switch (msg.type) {
                    case 'status':
                        setStatus(msg.payload)
                        if (msg.payload?.thinkingSteps) setThinkingSteps(msg.payload.thinkingSteps)
                        break
                    case 'event':
                        setEvents(prev => [msg.payload, ...prev].slice(0, 100))
                        setUnreadCount(c => c + 1)
                        break
                    case 'events_init':
                        setEvents(msg.payload || [])
                        setUnreadCount((msg.payload || []).filter((e: AgentEvent) => !e.read).length)
                        break
                    case 'thinking':
                        setThinkingSteps(prev => {
                            const existing = prev.findIndex(s => s.id === msg.payload.id)
                            if (existing >= 0) {
                                const updated = [...prev]
                                updated[existing] = msg.payload
                                return updated
                            }
                            return [...prev, msg.payload]
                        })
                        break
                    case 'thinking_clear':
                        setThinkingSteps([])
                        break
                }
            } catch { /* ignore */ }
        }

        es.onerror = () => setConnected(false)

        return () => { es.close(); esRef.current = null }
    }, [])

    const markAllRead = useCallback(async () => {
        try {
            await fetch('/api/agent/events/read', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
            setEvents(prev => prev.map(e => ({ ...e, read: true })))
            setUnreadCount(0)
        } catch { /* ignore */ }
    }, [])

    return { status, events, thinkingSteps, connected, unreadCount, markAllRead }
}
