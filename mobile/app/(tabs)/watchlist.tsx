import { useMemo, useState } from 'react';
import { Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { useWatchlist } from '../../hooks/useWatchlist';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { ConfidenceBar } from '../../components/ui/ConfidenceBar';
import { StockChart } from '../../components/StockChart';
import { useAuth } from '../../context/AuthContext';
import { formatCurrency } from '../../lib/format';

export default function WatchlistScreen() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const { items, loading, refresh, remove } = useWatchlist(Boolean(user));
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const sorted = useMemo(() => [...items].sort((a, b) => (b.confidenceScore || 0) - (a.confidenceScore || 0)), [items]);

  return (
    <>
      <ScrollView
        style={{ flex: 1, backgroundColor: theme.bgPrimary }}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void refresh()} tintColor={theme.blue} />}
      >
        <Text style={[styles.title, { color: theme.textPrimary }]}>Cloud watchlist</Text>
        <Text style={[styles.subtitle, { color: theme.textMuted }]}>Swipe actions can be added next; for now each saved setup opens a detail view and supports one-tap remove.</Text>

        {sorted.length === 0 ? (
          <Card>
            <Text style={[styles.emptyTitle, { color: theme.textPrimary }]}>No saved stocks yet</Text>
            <Text style={[styles.emptyText, { color: theme.textMuted }]}>Save ideas from the dashboard scanner and they’ll show up here across web and mobile.</Text>
          </Card>
        ) : sorted.map((item) => (
          <Pressable key={item.ticker} onPress={() => setSelectedTicker(item.ticker)}>
            <Card>
              <View style={styles.row}>
                <View>
                  <Text style={[styles.itemTitle, { color: theme.textPrimary }]}>{item.ticker}</Text>
                  <Text style={[styles.itemSubtitle, { color: theme.textMuted }]}>{item.setupType || 'Saved setup'} · {item.sector || 'NSE'}</Text>
                </View>
                <Badge
                  label={item.signal || 'WATCH'}
                  tone={item.signal === 'BUY' ? 'positive' : item.signal === 'REJECT' ? 'negative' : 'warning'}
                />
              </View>
              <View style={styles.row}>
                <Stat label="LTP" value={formatCurrency(item.ltp)} color={theme.textPrimary} />
                <Stat label="Target" value={formatCurrency(item.target)} color={theme.green} />
                <Stat label="Stop" value={formatCurrency(item.stopLoss)} color={theme.red} />
              </View>
              <ConfidenceBar value={item.confidenceScore} />
              <Button title="Remove" variant="ghost" onPress={() => void remove(item.ticker)} />
            </Card>
          </Pressable>
        ))}
      </ScrollView>

      <Modal visible={Boolean(selectedTicker)} transparent animationType="slide" onRequestClose={() => setSelectedTicker(null)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
            <Text style={[styles.modalTitle, { color: theme.textPrimary }]}>{selectedTicker}</Text>
            {selectedTicker ? <StockChart ticker={selectedTicker} /> : null}
            <Button title="Close" onPress={() => setSelectedTicker(null)} />
          </View>
        </View>
      </Modal>
    </>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={{ gap: 4 }}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 18,
    gap: 14,
  },
  title: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 28,
  },
  subtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    lineHeight: 19,
  },
  emptyTitle: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 20,
  },
  emptyText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    lineHeight: 20,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  itemTitle: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 20,
  },
  itemSubtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
  },
  statLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    color: '#7d839f',
    textTransform: 'uppercase',
  },
  statValue: {
    fontFamily: 'JetBrainsMono_500Medium',
    fontSize: 13,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    padding: 20,
    gap: 16,
  },
  modalTitle: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 24,
  },
});
