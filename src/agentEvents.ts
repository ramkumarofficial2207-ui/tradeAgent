// =====================================================
// agentEvents.ts — Agentic AI Event System
// Stores and streams AI agent activities, alerts, and market events
// =====================================================

export type EventType =
    | 'SCAN_START' | 'SCAN_COMPLETE' | 'SCAN_FAILED'
    | 'SETUP_FOUND' | 'SIGNAL_CHANGE'
    | 'MARKET_REGIME_CHANGE' | 'VIX_SPIKE' | 'MARKET_OPEN' | 'MARKET_CLOSE'
    | 'TRADE_ALERT' | 'SL_PROXIMITY' | 'TARGET_HIT' | 'TARGET_PROXIMITY'
    | 'PRICE_ALERT' | 'VOLUME_SPIKE'
    | 'AI_THINKING' | 'AI_ANALYSIS' | 'AI_RECOMMENDATION'
    | 'PORTFOLIO_UPDATE' | 'RISK_WARNING'
    | 'SYSTEM' | 'INFO';

export type EventSeverity = 'info' | 'success' | 'warning' | 'critical';

export interface AgentEvent {
    id: string;
    type: EventType;
    severity: EventSeverity;
    title: string;
    detail: string;
    ticker?: string;
    data?: Record<string, unknown>;
    timestamp: string;
    read: boolean;
}

export interface AgentStatus {
    state: 'IDLE' | 'SCANNING' | 'ANALYZING' | 'MONITORING' | 'ALERTING';
    currentTask: string | null;
    tasksCompleted: number;
    uptime: string;
    lastScanAt: string | null;
    nextScanAt: string | null;
    monitoredStocks: number;
    activeAlerts: number;
    thinkingSteps: ThinkingStep[];
}

export interface ThinkingStep {
    id: string;
    step: string;
    status: 'pending' | 'running' | 'done' | 'error';
    detail?: string;
    timestamp: string;
}

// In-memory event store (last 200 events)
const MAX_EVENTS = 200;
const events: AgentEvent[] = [];
let eventIdCounter = 0;

// SSE clients
const sseClients: Set<any> = new Set();

// Agent status
let agentStatus: AgentStatus = {
    state: 'IDLE',
    currentTask: null,
    tasksCompleted: 0,
    uptime: new Date().toISOString(),
    lastScanAt: null,
    nextScanAt: null,
    monitoredStocks: 0,
    activeAlerts: 0,
    thinkingSteps: [],
};

// Thinking steps for current operation
let currentThinkingSteps: ThinkingStep[] = [];

export function pushEvent(
    type: EventType,
    severity: EventSeverity,
    title: string,
    detail: string,
    extra?: { ticker?: string; data?: Record<string, unknown> }
): AgentEvent {
    const evt: AgentEvent = {
        id: `evt_${++eventIdCounter}_${Date.now()}`,
        type, severity, title, detail,
        ticker: extra?.ticker,
        data: extra?.data,
        timestamp: new Date().toISOString(),
        read: false,
    };
    events.unshift(evt);
    if (events.length > MAX_EVENTS) events.length = MAX_EVENTS;

    // Broadcast to SSE clients
    broadcastSSE({ type: 'event', payload: evt });

    return evt;
}

export function getEvents(limit = 50, unreadOnly = false): AgentEvent[] {
    let result = events;
    if (unreadOnly) result = events.filter(e => !e.read);
    return result.slice(0, limit);
}

export function getUnreadCount(): number {
    return events.filter(e => !e.read).length;
}

export function markAllRead(): void {
    events.forEach(e => e.read = true);
}

export function markRead(eventId: string): void {
    const evt = events.find(e => e.id === eventId);
    if (evt) evt.read = true;
}

// Agent status management
export function setAgentState(state: AgentStatus['state'], task?: string): void {
    agentStatus.state = state;
    agentStatus.currentTask = task || null;
    broadcastSSE({ type: 'status', payload: getAgentStatus() });
}

export function getAgentStatus(): AgentStatus {
    return { ...agentStatus, thinkingSteps: [...currentThinkingSteps], activeAlerts: getUnreadCount() };
}

export function incrementTasksCompleted(): void {
    agentStatus.tasksCompleted++;
}

export function setLastScan(at: string): void {
    agentStatus.lastScanAt = at;
}

export function setNextScan(at: string): void {
    agentStatus.nextScanAt = at;
}

export function setMonitoredStocks(count: number): void {
    agentStatus.monitoredStocks = count;
}

// Thinking steps
export function addThinkingStep(step: string, status: ThinkingStep['status'] = 'running', detail?: string): string {
    const id = `think_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const ts: ThinkingStep = {
        id,
        step,
        status,
        detail,
        timestamp: new Date().toISOString(),
    };
    currentThinkingSteps.push(ts);
    broadcastSSE({ type: 'thinking', payload: ts });
    return id;
}

export function updateThinkingStep(id: string, status: ThinkingStep['status'], detail?: string): void {
    const step = currentThinkingSteps.find(s => s.id === id);
    if (step) {
        step.status = status;
        if (detail) step.detail = detail;
        broadcastSSE({ type: 'thinking', payload: step });
    }
}

export function clearThinkingSteps(): void {
    currentThinkingSteps = [];
    broadcastSSE({ type: 'thinking_clear', payload: null });
}

// SSE broadcasting
export function addSSEClient(res: any): void {
    sseClients.add(res);
    // Send current status immediately
    res.write(`data: ${JSON.stringify({ type: 'status', payload: getAgentStatus() })}\n\n`);
    // Send recent events
    const recent = getEvents(20);
    res.write(`data: ${JSON.stringify({ type: 'events_init', payload: recent })}\n\n`);
}

export function removeSSEClient(res: any): void {
    sseClients.delete(res);
}

function broadcastSSE(data: { type: string; payload: any }): void {
    const msg = `data: ${JSON.stringify(data)}\n\n`;
    sseClients.forEach(client => {
        try { client.write(msg); } catch { sseClients.delete(client); }
    });
}

// Scanner lifecycle updates use the same authenticated SSE channel as agent
// events, while the dashboard also polls the durable database status as a
// reconnect-safe fallback.
export function publishScanStatus(status: unknown): void {
    broadcastSSE({ type: 'scan_status', payload: status });
}

// Initialize with a startup event
pushEvent('SYSTEM', 'info', 'ApexScan AI Agent Online', 'AI agent initialized and ready to monitor markets');
