import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { formatCompact } from '../lib/format';
import { FiiDiiSummary } from '../lib/types';

export function FiiDiiWidget({ summary }: { summary: FiiDiiSummary | null }) {
  const { theme } = useTheme();
  const latest = summary?.latest;
  return (
    <View style={[styles.wrapper, { backgroundColor: theme.bgSoft, borderColor: theme.border }]}>
      <Text style={[styles.title, { color: theme.textPrimary }]}>FII / DII Flow</Text>
      <Text style={[styles.detail, { color: theme.textMuted }]}>{summary?.trend.detail || 'Institutional flow not synced yet.'}</Text>
      <View style={styles.row}>
        <Flow label="1D" value={summary?.totals.totalNet1dCr} positive={(summary?.totals.totalNet1dCr || 0) >= 0} />
        <Flow label="5D" value={summary?.totals.totalNet5dCr} positive={(summary?.totals.totalNet5dCr || 0) >= 0} />
        <Flow label="20D" value={summary?.totals.totalNet20dCr} positive={(summary?.totals.totalNet20dCr || 0) >= 0} />
      </View>
      {latest ? (
        <Text style={[styles.footer, { color: theme.textMuted }]}>
          Latest session: FII {formatCompact(latest.fiiNet)} · DII {formatCompact(latest.diiNet)}
        </Text>
      ) : null}
    </View>
  );
}

function Flow({ label, value, positive }: { label: string; value?: number; positive: boolean }) {
  return (
    <View style={{ flex: 1, gap: 4 }}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, { color: positive ? '#10b981' : '#ef4444' }]}>{formatCompact(value || 0)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
    gap: 12,
  },
  title: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 18,
  },
  detail: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    lineHeight: 18,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  metricLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    color: '#7d839f',
    textTransform: 'uppercase',
  },
  metricValue: {
    fontFamily: 'JetBrainsMono_500Medium',
    fontSize: 13,
  },
  footer: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
  },
});
