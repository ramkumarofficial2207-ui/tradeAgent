import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../context/ThemeContext';
import { api } from '../../lib/api';
import { FiiDiiSummary, MarketPulse, SectorPulse, TradeSetup } from '../../lib/types';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { MetricBox } from '../../components/ui/MetricBox';
import { MarketTickerTape } from '../../components/MarketTickerTape';
import { AgentStatusPill } from '../../components/AgentStatusPill';
import { AIActionCard } from '../../components/AIActionCard';
import { SectorHeatmap } from '../../components/SectorHeatmap';
import { FiiDiiWidget } from '../../components/FiiDiiWidget';
import { NotificationPanel } from '../../components/NotificationPanel';
import { OnboardingScreens } from '../../components/OnboardingScreens';
import { useWatchlist } from '../../hooks/useWatchlist';
import { useAgentSSE } from '../../hooks/useAgentSSE';
import { useAuth } from '../../context/AuthContext';

export default function DashboardScreen() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const { items, isSaved, add, remove, refresh: refreshWatchlist } = useWatchlist(Boolean(user));
  const { connected, status, events } = useAgentSSE(Boolean(user));
  const [refreshing, setRefreshing] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scan, setScan] = useState<{ setups: TradeSetup[]; timestamp?: string; marketStatus?: any } | null>(null);
  const [pulse, setPulse] = useState<MarketPulse | null>(null);
  const [sectors, setSectors] = useState<SectorPulse | null>(null);
  const [fiiDii, setFiiDii] = useState<FiiDiiSummary | null>(null);

  const loadDashboard = useCallback(async () => {
    const [scanRes, pulseRes, sectorRes, fiiRes] = await Promise.all([
      api.get('/api/last', { params: { mode: 'swing' } }),
      api.get('/api/market-pulse'),
      api.get('/api/sectors'),
      api.get('/api/fii-dii'),
    ]);
    setScan(scanRes.data?.data || null);
    setPulse(pulseRes.data?.data || null);
    setSectors(sectorRes.data?.data || null);
    setFiiDii(fiiRes.data?.data || null);
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([loadDashboard(), refreshWatchlist()]);
    } finally {
      setRefreshing(false);
    }
  };

  const runScan = async () => {
    setScanning(true);
    try {
      const { data } = await api.get('/api/scan', { params: { mode: 'swing', force: true } });
      setScan(data?.data || null);
    } finally {
      setScanning(false);
    }
  };

  const stats = useMemo(() => {
    const setups = scan?.setups || [];
    return {
      total: setups.length,
      buy: setups.filter((item) => item.aiSignal === 'BUY').length,
      saved: items.length,
      regime: scan?.marketStatus?.regime || 'NEUTRAL',
    };
  }, [scan, items.length]);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.bgPrimary }}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.blue} />}
    >
      <LinearGradient colors={['#0a1424', '#0e213e', '#152a52']} style={styles.hero}>
        <Text style={styles.heroTitle}>Market cockpit</Text>
        <Text style={styles.heroText}>Run the scanner, monitor live agent status, and move high-conviction ideas into your watchlist.</Text>
        <Button title={scanning ? 'Scanning market...' : 'Run AI Scan'} loading={scanning} onPress={() => void runScan()} />
      </LinearGradient>

      <MarketTickerTape pulse={pulse} />
      <AgentStatusPill status={status} connected={connected} />

      <View style={styles.metricRow}>
        <MetricBox label="Setups" value={stats.total} accent={theme.textPrimary} />
        <MetricBox label="BUY Signals" value={stats.buy} accent={theme.green} />
        <MetricBox label="Watchlist" value={stats.saved} accent={theme.cyan} />
        <MetricBox label="Regime" value={stats.regime} accent={theme.amber} />
      </View>

      <Card>
        <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Top AI action cards</Text>
        {scan?.setups?.length ? scan.setups.slice(0, 5).map((setup) => (
          <AIActionCard
            key={setup.ticker}
            setup={setup}
            saved={isSaved(setup.ticker)}
            onToggleWatchlist={() => void (isSaved(setup.ticker)
              ? remove(setup.ticker)
              : add({
                  ticker: setup.ticker,
                  sector: setup.sector,
                  signal: setup.aiSignal,
                  ltp: setup.ltp,
                  target: setup.target,
                  stopLoss: setup.stopLoss,
                  targetPct: setup.targetPct,
                  slPct: setup.slPct,
                  riskReward: setup.riskReward,
                  confidenceScore: setup.confidenceScore,
                  setupType: setup.setupType,
                  buyZone: setup.buyZone,
                }))}
          />
        )) : <OnboardingScreens />}
      </Card>

      <Card>
        <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Sector pulse</Text>
        <SectorHeatmap sectors={sectors?.sectors || []} />
      </Card>

      <FiiDiiWidget summary={fiiDii} />
      <NotificationPanel events={events} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 18,
    gap: 16,
  },
  hero: {
    borderRadius: 28,
    padding: 22,
    gap: 14,
  },
  heroTitle: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 30,
    color: '#f7f8ff',
  },
  heroText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: '#d6def7',
    lineHeight: 21,
  },
  metricRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  sectionTitle: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 20,
  },
});
