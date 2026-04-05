import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { formatPct } from '../lib/format';
import { MarketPulse } from '../lib/types';

const LABELS: Record<string, string> = {
  nifty: 'NIFTY',
  sensex: 'SENSEX',
  banknifty: 'BANK',
  midcap: 'MIDCAP',
  vix: 'VIX',
};

export function MarketTickerTape({ pulse }: { pulse: MarketPulse | null }) {
  const { theme } = useTheme();
  const entries = Object.entries(pulse?.indices || {}).filter(([key]) => LABELS[key]);

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {entries.map(([key, value]) => {
        const positive = value.change >= 0;
        return (
          <View key={key} style={[styles.card, { backgroundColor: theme.bgSoft, borderColor: theme.border }]}>
            <Text style={[styles.label, { color: theme.textMuted }]}>{LABELS[key]}</Text>
            <Text style={[styles.price, { color: theme.textPrimary }]}>{value.price.toFixed(2)}</Text>
            <Text style={[styles.change, { color: positive ? theme.green : theme.red }]}>{formatPct(value.change)}</Text>
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: 10,
  },
  card: {
    minWidth: 108,
    borderWidth: 1,
    borderRadius: 18,
    padding: 12,
    gap: 3,
  },
  label: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
  },
  price: {
    fontFamily: 'JetBrainsMono_500Medium',
    fontSize: 15,
  },
  change: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
  },
});
