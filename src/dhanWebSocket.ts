import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { liveTickerStore } from './liveTickerStore';

const DHAN_WS_URL = 'wss://api-feed.dhan.co';

export interface DhanWsConfig {
    clientId: string;
    accessToken: string;
}

export class DhanWebSocketClient extends EventEmitter {
    private ws: WebSocket | null = null;
    private clientId: string;
    private accessToken: string;
    private isReconnecting = false;
    private reconnectAttempts = 0;
    private maxReconnectDelay = 30000;
    private subscribedSecurityIds = new Set<string>();

    constructor(config: DhanWsConfig) {
        super();
        this.clientId = config.clientId;
        this.accessToken = config.accessToken;
    }

    /**
     * Connect to Dhan HQ Market Feed WebSocket
     */
    public connect(): void {
        if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
            console.log('[Dhan WS] Already connected or connecting.');
            return;
        }

        const url = `${DHAN_WS_URL}?version=2&token=${encodeURIComponent(this.accessToken)}&clientId=${encodeURIComponent(this.clientId)}&authType=2`;

        console.log('[Dhan WS] 🔌 Connecting to Dhan HQ Live Market Feed...');
        this.ws = new WebSocket(url);

        this.ws.on('open', () => {
            console.log('[Dhan WS] 🟢 Connected to Dhan HQ Live Feed!');
            this.reconnectAttempts = 0;
            this.isReconnecting = false;
            this.emit('connected');

            // Re-subscribe all queued security IDs on reconnect
            if (this.subscribedSecurityIds.size > 0) {
                console.log(`[Dhan WS] 🔄 Resubscribing ${this.subscribedSecurityIds.size} securities...`);
                this.sendSubscriptionRequest(Array.from(this.subscribedSecurityIds));
            }
        });

        this.ws.on('message', (data: WebSocket.Data) => {
            this.handleMessage(data);
        });

        this.ws.on('error', (err: Error) => {
            console.warn('[Dhan WS] ⚠️ Connection notice:', err.message);
            if (this.listenerCount('error') > 0) {
                this.emit('error', err);
            }
        });

        this.ws.on('close', (code: number, reason: string) => {
            console.warn(`[Dhan WS] 🔴 Connection closed (code: ${code}). Reconnecting...`);
            this.emit('disconnected');
            this.scheduleReconnect();
        });
    }

    /**
     * Subscribe to live feeds for security IDs (Dhan internal security ID, e.g. "2885")
     */
    public subscribe(securityIds: string[]): void {
        const newIds = securityIds.filter(id => !this.subscribedSecurityIds.has(id));
        if (newIds.length === 0) return;

        newIds.forEach(id => this.subscribedSecurityIds.add(id));

        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.sendSubscriptionRequest(newIds);
        }
    }

    private sendSubscriptionRequest(securityIds: string[]): void {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

        // Dhan HQ RequestCode 21 = Ticker Data (LTP, Volume, High, Low)
        const payload = {
            RequestCode: 21,
            InstrumentCount: securityIds.length,
            InstrumentList: securityIds.map(id => ({
                ExchangeSegment: 'NSE_EQ',
                SecurityId: String(id),
            })),
        };

        try {
            this.ws.send(JSON.stringify(payload));
            console.log(`[Dhan WS] 📡 Subscribed to ${securityIds.length} securities via WebSocket`);
        } catch (e: any) {
            console.error('[Dhan WS] Failed to send subscription payload:', e.message);
        }
    }

    /**
     * Unsubscribe from security IDs
     */
    public unsubscribe(securityIds: string[]): void {
        securityIds.forEach(id => this.subscribedSecurityIds.delete(id));
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            const payload = {
                RequestCode: 22, // Code 22 = Unsubscribe
                InstrumentCount: securityIds.length,
                InstrumentList: securityIds.map(id => ({
                    ExchangeSegment: 'NSE_EQ',
                    SecurityId: String(id),
                })),
            };
            this.ws.send(JSON.stringify(payload));
        }
    }

    /**
     * Parse binary / JSON packet frames from Dhan HQ feed
     */
    private handleMessage(data: WebSocket.Data): void {
        try {
            // Case 1: JSON frame
            if (typeof data === 'string') {
                const parsed = JSON.parse(data);
                if (parsed.securityId || parsed.SecurityId) {
                    const secId = String(parsed.securityId || parsed.SecurityId);
                    const ltp = parseFloat(parsed.LTP || parsed.ltp || parsed.last_price || 0);
                    if (ltp > 0) {
                        liveTickerStore.updateTick({
                            securityId: secId,
                            ltp,
                            dayHigh: parsed.dayHigh ? parseFloat(parsed.dayHigh) : undefined,
                            dayLow: parsed.dayLow ? parseFloat(parsed.dayLow) : undefined,
                            volume: parsed.volume ? parseInt(parsed.volume) : undefined,
                        });
                    }
                }
                return;
            }

            // Case 2: Binary Buffer frame (Dhan Packet Format)
            if (Buffer.isBuffer(data)) {
                if (data.length < 8) return;

                // Dhan Feed Type Header
                const feedType = data.readUInt8(0);
                
                // Dhan Ticker Packet (Feed Type 2 or 4 or 8)
                if (data.length >= 16) {
                    const securityId = data.readInt32LE(4).toString();
                    const ltp = data.readFloatLE(8);
                    
                    if (ltp > 0 && ltp < 1000000) {
                        let dayHigh: number | undefined;
                        let dayLow: number | undefined;
                        let volume: number | undefined;

                        if (data.length >= 28) {
                            dayHigh = data.readFloatLE(16);
                            dayLow = data.readFloatLE(20);
                            volume = data.readInt32LE(24);
                        }

                        liveTickerStore.updateTick({
                            securityId,
                            ltp,
                            dayHigh,
                            dayLow,
                            volume,
                        });
                    }
                }
            }
        } catch (err: any) {
            // Ignore malformed frames silently
        }
    }

    private scheduleReconnect(): void {
        if (this.isReconnecting) return;
        this.isReconnecting = true;
        this.reconnectAttempts++;

        const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), this.maxReconnectDelay);
        console.log(`[Dhan WS] Reconnecting in ${(delay / 1000).toFixed(1)}s (Attempt #${this.reconnectAttempts})...`);

        setTimeout(() => {
            this.isReconnecting = false;
            this.connect();
        }, delay);
    }

    public isConnected(): boolean {
        return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
    }

    public disconnect(): void {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }
}

// Global Singleton Instance
let dhanWsInstance: DhanWebSocketClient | null = null;

export function getDhanWebSocketInstance(): DhanWebSocketClient | null {
    if (dhanWsInstance) return dhanWsInstance;

    const clientId = process.env.DHAN_CLIENT_ID;
    const accessToken = process.env.DHAN_ACCESS_TOKEN;

    if (!clientId || !accessToken) {
        console.warn('[Dhan WS] DHAN_CLIENT_ID or DHAN_ACCESS_TOKEN not set in .env file.');
        return null;
    }

    dhanWsInstance = new DhanWebSocketClient({ clientId, accessToken });
    return dhanWsInstance;
}
