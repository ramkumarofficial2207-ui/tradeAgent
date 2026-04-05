import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useTheme } from '../context/ThemeContext';
import { api } from '../lib/api';
import { ChartPoint } from '../lib/types';

function buildPath(values: number[], width: number, height: number) {
  if (!values.length) return '';
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  return values.map((value, index) => {
    const x = (index / Math.max(values.length - 1, 1)) * width;
    const y = height - ((value - min) / range) * height;
    return `${index === 0 ? 'M' : 'L'}${x} ${y}`;
  }).join(' ');
}

export function StockChart({ ticker }: { ticker: string }) {
  const { theme } = useTheme();
  const [loading, setLoading] = useState(true);
  const [points, setPoints] = useState<ChartPoint[]>([]);

  useEffect(() => {
    setLoading(true);
    api.get(`/api/chart/${ticker}`, { params: { interval: '1d', days: 90 } })
      .then(({ data }) => setPoints(data?.data?.candles || []))
      .catch(() => setPoints([]))
      .finally(() => setLoading(false));
  }, [ticker]);

  const linePath = useMemo(() => {
    const closes = points.map((point) => point.close).slice(-50);
    return buildPath(closes, 300, 140);
  }, [points]);

  return (
    <View style={[styles.card, { backgroundColor: theme.bgSoft, borderColor: theme.border }]}>
      <Text style={[styles.title, { color: theme.textPrimary }]}>{ticker} price structure</Text>
      {loading ? (
        <ActivityIndicator color={theme.blue} />
      ) : linePath ? (
        <Svg width="100%" height={150} viewBox="0 0 300 140">
          <Path d={linePath} fill="none" stroke={theme.blue} strokeWidth={3} />
        </Svg>
      ) : (
        <Text style={[styles.empty, { color: theme.textMuted }]}>Chart data unavailable right now.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
    gap: 12,
  },
  title: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 16,
  },
  empty: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
  },
});
