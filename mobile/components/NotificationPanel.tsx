import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { AgentEvent } from '../lib/types';
import { Card } from './ui/Card';

export function NotificationPanel({ events }: { events: AgentEvent[] }) {
  const { theme } = useTheme();

  return (
    <Card>
      <Text style={[styles.title, { color: theme.textPrimary }]}>Live Agent Feed</Text>
      <FlatList
        data={events.slice(0, 5)}
        keyExtractor={(item) => item.id}
        scrollEnabled={false}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        renderItem={({ item }) => (
          <View style={[styles.item, { backgroundColor: theme.bgSoft }]}>
            <Text style={[styles.itemTitle, { color: theme.textPrimary }]}>{item.title}</Text>
            <Text style={[styles.itemDetail, { color: theme.textMuted }]}>{item.detail}</Text>
          </View>
        )}
        ListEmptyComponent={<Text style={[styles.empty, { color: theme.textMuted }]}>No agent events yet.</Text>}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  title: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 18,
  },
  item: {
    borderRadius: 14,
    padding: 12,
    gap: 4,
  },
  itemTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
  },
  itemDetail: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    lineHeight: 18,
  },
  empty: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
  },
});
