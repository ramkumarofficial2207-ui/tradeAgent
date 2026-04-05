import { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { api } from '../../lib/api';
import { formatCurrency, formatDate } from '../../lib/format';
import { PortfolioSummary, PortfolioTrade } from '../../lib/types';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { MetricBox } from '../../components/ui/MetricBox';

export default function PortfolioScreen() {
  const { theme } = useTheme();
  const [summary, setSummary] = useState<PortfolioSummary | null>(null);
  const [trades, setTrades] = useState<PortfolioTrade[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [showAddTrade, setShowAddTrade] = useState(false);
  const [form, setForm] = useState({
    ticker: '',
    entryPrice: '',
    quantity: '',
    stopLossInit: '',
    target1: '',
    target2: '',
  });

  const loadPortfolio = useCallback(async () => {
    const [portfolioRes, summaryRes] = await Promise.all([
      api.get('/api/portfolio'),
      api.get('/api/portfolio/summary'),
    ]);
    setTrades(portfolioRes.data?.data || []);
    setSummary(summaryRes.data?.data || null);
  }, []);

  useEffect(() => {
    void loadPortfolio();
  }, [loadPortfolio]);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await loadPortfolio();
    } finally {
      setRefreshing(false);
    }
  };

  const openTrades = useMemo(() => trades.filter((trade) => trade.status === 'OPEN'), [trades]);
  const closedTrades = useMemo(() => trades.filter((trade) => trade.status === 'CLOSED'), [trades]);

  const addTrade = async () => {
    await api.post('/api/portfolio/trade', {
      ticker: form.ticker,
      entryPrice: Number(form.entryPrice),
      quantity: Number(form.quantity),
      stopLossInit: Number(form.stopLossInit),
      target1: Number(form.target1),
      target2: form.target2 ? Number(form.target2) : undefined,
    });
    setShowAddTrade(false);
    setForm({ ticker: '', entryPrice: '', quantity: '', stopLossInit: '', target1: '', target2: '' });
    await loadPortfolio();
  };

  return (
    <>
      <ScrollView
        style={{ flex: 1, backgroundColor: theme.bgPrimary }}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.blue} />}
      >
        <Text style={[styles.title, { color: theme.textPrimary }]}>Portfolio</Text>

        <View style={styles.metrics}>
          <MetricBox label="Open Trades" value={summary?.openTrades ?? openTrades.length} accent={theme.cyan} />
          <MetricBox label="Closed Trades" value={summary?.closedTrades ?? closedTrades.length} accent={theme.textPrimary} />
          <MetricBox label="Win Rate" value={summary?.winRate ? `${summary.winRate.toFixed(1)}%` : '--'} accent={theme.green} />
          <MetricBox label="Capital" value={summary?.capitalDeployed ?? 0} accent={theme.amber} />
        </View>

        <Card>
          <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Open positions</Text>
          {openTrades.length ? openTrades.map((trade) => (
            <TradeCard key={trade.id} trade={trade} theme={theme} />
          )) : <Text style={[styles.empty, { color: theme.textMuted }]}>No open trades yet.</Text>}
        </Card>

        <Card>
          <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Closed trades</Text>
          {closedTrades.length ? closedTrades.slice(0, 10).map((trade) => (
            <TradeCard key={trade.id} trade={trade} theme={theme} />
          )) : <Text style={[styles.empty, { color: theme.textMuted }]}>No closed trades yet.</Text>}
        </Card>
      </ScrollView>

      <View style={styles.fab}>
        <Button title="Add Trade" onPress={() => setShowAddTrade(true)} />
      </View>

      <Modal visible={showAddTrade} transparent animationType="slide" onRequestClose={() => setShowAddTrade(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
            <Text style={[styles.modalTitle, { color: theme.textPrimary }]}>Add Trade</Text>
            {[
              { key: 'ticker', label: 'Ticker' },
              { key: 'entryPrice', label: 'Entry Price' },
              { key: 'quantity', label: 'Quantity' },
              { key: 'stopLossInit', label: 'Stop Loss' },
              { key: 'target1', label: 'Target 1' },
              { key: 'target2', label: 'Target 2 (optional)' },
            ].map((field) => (
              <TextInput
                key={field.key}
                placeholder={field.label}
                placeholderTextColor={theme.textMuted}
                value={form[field.key as keyof typeof form]}
                onChangeText={(value) => setForm((prev) => ({ ...prev, [field.key]: value }))}
                style={[styles.input, { color: theme.textPrimary, borderColor: theme.border, backgroundColor: theme.bgSoft }]}
              />
            ))}
            <Button title="Save Trade" onPress={() => void addTrade()} />
            <Button title="Cancel" variant="ghost" onPress={() => setShowAddTrade(false)} />
          </View>
        </View>
      </Modal>
    </>
  );
}

function TradeCard({ trade, theme }: { trade: PortfolioTrade; theme: ReturnType<typeof useTheme>['theme'] }) {
  const positive = (trade.pnlRs || 0) >= 0;
  return (
    <View style={[styles.tradeRow, { backgroundColor: theme.bgSoft }]}>
      <View style={{ gap: 4, flex: 1 }}>
        <Text style={[styles.tradeTicker, { color: theme.textPrimary }]}>{trade.ticker}</Text>
        <Text style={[styles.tradeMeta, { color: theme.textMuted }]}>
          {formatDate(trade.entryDate)} · Qty {trade.quantity}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        <Text style={[styles.tradeValue, { color: theme.textPrimary }]}>{formatCurrency(trade.currentPrice || trade.entryPrice)}</Text>
        <Text style={[styles.tradePnl, { color: positive ? theme.green : theme.red }]}>{formatCurrency(trade.pnlRs || 0)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 18,
    gap: 16,
    paddingBottom: 100,
  },
  title: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 28,
  },
  metrics: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  sectionTitle: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 20,
  },
  empty: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
  },
  tradeRow: {
    borderRadius: 16,
    padding: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  tradeTicker: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 18,
  },
  tradeMeta: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
  },
  tradeValue: {
    fontFamily: 'JetBrainsMono_500Medium',
    fontSize: 13,
  },
  tradePnl: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
  },
  fab: {
    position: 'absolute',
    right: 18,
    bottom: 28,
    left: 18,
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  modalCard: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    padding: 20,
    gap: 12,
  },
  modalTitle: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 24,
    marginBottom: 8,
  },
  input: {
    minHeight: 50,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    fontFamily: 'Inter_500Medium',
    fontSize: 15,
  },
});
