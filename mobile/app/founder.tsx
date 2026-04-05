import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { api } from '../lib/api';
import { Card } from '../components/ui/Card';

export default function FounderScreen() {
  const { theme } = useTheme();
  const [summary, setSummary] = useState<string>('Loading edge analytics...');

  useEffect(() => {
    api.get('/api/founder/edge-dashboard').then(({ data }) => {
      const strongest = data?.data?.strongestBuckets?.length || 0;
      const weakest = data?.data?.weakestBuckets?.length || 0;
      setSummary(`Edge dashboard loaded with ${strongest} strongest buckets and ${weakest} weak spots to review.`);
    }).catch(() => setSummary('Edge dashboard is available on the backend, but the detailed founder view still needs a richer tablet layout.'));
  }, []);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.bgPrimary }} contentContainerStyle={styles.content}>
      <Card>
        <Text style={[styles.title, { color: theme.textPrimary }]}>Edge Lab</Text>
        <Text style={[styles.copy, { color: theme.textSecondary }]}>{summary}</Text>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 18,
  },
  title: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 28,
  },
  copy: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    lineHeight: 21,
  },
});
