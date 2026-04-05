import { useEffect, useRef, useState } from 'react';
import EventSource from 'react-native-sse';
import { getApiBaseUrl } from '../lib/api';
import { AgentEvent, AgentStatus, ThinkingStep } from '../lib/types';

export function useAgentSSE(enabled: boolean) {
  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState<AgentStatus | null>(null);
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [thinkingSteps, setThinkingSteps] = useState<ThinkingStep[]>([]);
  const sourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const source = new EventSource(`${getApiBaseUrl()}/api/agent/stream`);
    sourceRef.current = source;

    source.addEventListener('open', () => setConnected(true));
    source.addEventListener('error', () => setConnected(false));
    source.addEventListener('message', (event) => {
      try {
        const payload = JSON.parse(event.data ?? '{}');
        if (payload.type === 'status') {
          setStatus(payload.payload);
          if (payload.payload?.thinkingSteps) setThinkingSteps(payload.payload.thinkingSteps);
        }
        if (payload.type === 'event') {
          setEvents((prev) => [payload.payload, ...prev].slice(0, 40));
        }
        if (payload.type === 'events_init') {
          setEvents(payload.payload || []);
        }
        if (payload.type === 'thinking') {
          setThinkingSteps((prev) => {
            const index = prev.findIndex((step) => step.id === payload.payload.id);
            if (index === -1) return [...prev, payload.payload];
            const next = [...prev];
            next[index] = payload.payload;
            return next;
          });
        }
        if (payload.type === 'thinking_clear') {
          setThinkingSteps([]);
        }
      } catch {}
    });

    return () => {
      source.close();
      sourceRef.current = null;
    };
  }, [enabled]);

  return { connected, status, events, thinkingSteps };
}
