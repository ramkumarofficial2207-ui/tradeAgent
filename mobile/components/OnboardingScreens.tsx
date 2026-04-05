import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { Card } from './ui/Card';

const PANELS = [
  {
    title: 'Cloud watchlist',
    detail: 'Save setups from the scanner and keep the same list across mobile and web.',
  },
  {
    title: 'Live agent stream',
    detail: 'Follow scan progress, reasoning steps, and trade alerts in real time.',
  },
  {
    title: 'Portfolio intelligence',
    detail: 'Track deployed capital, win rate, and open trade risk from one place.',
  },
];

export function OnboardingScreens() {
  const { theme } = useTheme();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {PANELS.map((panel) => (
        <Card key={panel.title} style={[styles.card, { width: 260 }]}>
          <Text style={[styles.title, { color: theme.textPrimary }]}>{panel.title}</Text>
          <Text style={[styles.detail, { color: theme.textMuted }]}>{panel.detail}</Text>
        </Card>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: 12,
  },
  card: {
    justifyContent: 'space-between',
    minHeight: 140,
  },
  title: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 18,
  },
  detail: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    lineHeight: 20,
  },
});
