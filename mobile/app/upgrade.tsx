import { ScrollView, StyleSheet, Text } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';

export default function UpgradeScreen() {
  const { theme } = useTheme();

  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.bgPrimary }} contentContainerStyle={styles.content}>
      <Card>
        <Text style={[styles.title, { color: theme.textPrimary }]}>Upgrade to full scanner access</Text>
        <Text style={[styles.price, { color: theme.blue }]}>₹2,999 / month</Text>
        <Text style={[styles.copy, { color: theme.textSecondary }]}>Unlock unlimited scans, grounded AI chat, portfolio intelligence, and live mobile alerts.</Text>
        <Button title="Contact sales / billing" />
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
  price: {
    fontFamily: 'JetBrainsMono_500Medium',
    fontSize: 24,
  },
  copy: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    lineHeight: 21,
  },
});
