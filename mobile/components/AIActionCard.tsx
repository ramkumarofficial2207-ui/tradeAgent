import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { formatCurrency, formatPct } from '../lib/format';
import { TradeSetup } from '../lib/types';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { ConfidenceBar } from './ui/ConfidenceBar';

export function AIActionCard({
  setup,
  saved,
  onToggleWatchlist,
}: {
  setup: TradeSetup;
  saved?: boolean;
  onToggleWatchlist?: () => void;
}) {
  const { theme } = useTheme();
  const tone = setup.aiSignal === 'BUY' ? 'positive' : setup.aiSignal === 'REJECT' ? 'negative' : 'warning';

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <View>
          <Text style={[styles.ticker, { color: theme.textPrimary }]}>{setup.ticker}</Text>
          <Text style={[styles.subtitle, { color: theme.textMuted }]}>{setup.setupType} · {setup.sector}</Text>
        </View>
        <View style={[styles.signal, { backgroundColor: tone === 'positive' ? theme.successBg : tone === 'negative' ? theme.dangerBg : theme.warningBg }]}>
          <Text style={[styles.signalText, { color: tone === 'positive' ? theme.green : tone === 'negative' ? theme.red : theme.amber }]}>
            {setup.aiSignal || 'WATCH'}
          </Text>
        </View>
      </View>

      <View style={styles.grid}>
        <Metric label="LTP" value={formatCurrency(setup.ltp)} color={theme.textPrimary} />
        <Metric label="Target" value={formatCurrency(setup.target)} color={theme.green} />
        <Metric label="Stop" value={formatCurrency(setup.stopLoss)} color={theme.red} />
        <Metric label="R:R" value={`${setup.riskReward.toFixed(2)}x`} color={theme.cyan} />
      </View>

      <ConfidenceBar value={setup.confidenceScore} />

      <Text style={[styles.logic, { color: theme.textSecondary }]}>
        {setup.aiLogic || setup.catalyst || `Target ${formatPct(setup.targetPct)} with stop ${formatPct(-Math.abs(setup.slPct))}.`}
      </Text>

      <Button
        title={saved ? 'Saved to Watchlist' : 'Save to Watchlist'}
        variant={saved ? 'secondary' : 'primary'}
        onPress={onToggleWatchlist}
      />
    </Card>
  );
}

function Metric({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, { color }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  ticker: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 22,
  },
  subtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    marginTop: 2,
  },
  signal: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
  },
  signalText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  metric: {
    minWidth: '47%',
    gap: 4,
  },
  metricLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    color: '#7d839f',
    textTransform: 'uppercase',
  },
  metricValue: {
    fontFamily: 'JetBrainsMono_500Medium',
    fontSize: 14,
  },
  logic: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    lineHeight: 20,
  },
});
