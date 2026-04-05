import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { api } from '../lib/api';
import { formatDate } from '../lib/format';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { FilterPill } from '../components/ui/FilterPill';

export default function ProfileScreen() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const { theme, mode, setMode } = useTheme();
  const [prefs, setPrefs] = useState({
    telegramChatId: '',
    notifyBuySignals: true,
    notifyEmail: true,
  });

  useEffect(() => {
    api.get('/api/user/preferences').then(({ data }) => {
      if (data?.success && data?.data) {
        setPrefs({
          telegramChatId: data.data.telegramChatId || '',
          notifyBuySignals: data.data.notifyBuySignals !== false,
          notifyEmail: data.data.notifyEmail !== false,
        });
      }
    }).catch(() => {});
  }, []);

  const savePrefs = async () => {
    await api.post('/api/user/preferences', {
      whatsappNumber: prefs.telegramChatId,
      notifyBuySignals: prefs.notifyBuySignals,
      notifyEmail: prefs.notifyEmail,
    });
  };

  if (!user) return null;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.bgPrimary }} contentContainerStyle={styles.content}>
      <Card>
        <Text style={[styles.name, { color: theme.textPrimary }]}>{user.name || 'Trader'}</Text>
        <Text style={[styles.meta, { color: theme.textMuted }]}>{user.email}</Text>
        <Text style={[styles.meta, { color: theme.textMuted }]}>Mobile: {user.mobileNumber || '--'}</Text>
        <Text style={[styles.meta, { color: theme.textMuted }]}>Member since {formatDate(user.createdAt)}</Text>
      </Card>

      <Card>
        <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Subscription</Text>
        <Text style={[styles.plan, { color: theme.blue }]}>{user.subscriptionStatus || 'TRIAL'}</Text>
        <Text style={[styles.meta, { color: theme.textMuted }]}>Expiry: {formatDate(user.subscriptionExpiry || null)}</Text>
        <Button title="Upgrade Plan" onPress={() => router.push('/upgrade')} />
      </Card>

      <Card>
        <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Appearance</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {(['dark', 'light', 'system'] as const).map((entry) => (
            <FilterPill key={entry} label={entry} active={mode === entry} onPress={() => void setMode(entry)} />
          ))}
        </View>
      </Card>

      <Card>
        <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Notifications</Text>
        <PreferenceRow label="BUY signal alerts" value={prefs.notifyBuySignals} onValueChange={(value) => setPrefs((prev) => ({ ...prev, notifyBuySignals: value }))} />
        <PreferenceRow label="Email summaries" value={prefs.notifyEmail} onValueChange={(value) => setPrefs((prev) => ({ ...prev, notifyEmail: value }))} />
        <Button title="Save Preferences" onPress={() => void savePrefs()} />
      </Card>

      <Card>
        <Button title="Edge Lab" variant="secondary" onPress={() => router.push('/founder')} />
        <Button title="Sign Out" variant="ghost" onPress={() => void logout().then(() => router.replace('/login'))} />
        <Text style={[styles.version, { color: theme.textMuted }]}>App version {Constants.expoConfig?.version || '1.0.0'}</Text>
      </Card>
    </ScrollView>
  );
}

function PreferenceRow({
  label,
  value,
  onValueChange,
}: {
  label: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
}) {
  const { theme } = useTheme();
  return (
    <View style={styles.prefRow}>
      <Text style={[styles.prefLabel, { color: theme.textSecondary }]}>{label}</Text>
      <Switch value={value} onValueChange={onValueChange} />
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 18,
    gap: 16,
  },
  name: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 28,
  },
  sectionTitle: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 20,
  },
  plan: {
    fontFamily: 'JetBrainsMono_500Medium',
    fontSize: 18,
  },
  meta: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    lineHeight: 20,
  },
  prefRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  prefLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
  },
  version: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    textAlign: 'center',
  },
});
