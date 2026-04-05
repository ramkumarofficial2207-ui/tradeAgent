import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { AgentStatus } from '../lib/types';
import { Badge } from './ui/Badge';
import { StatusDot } from './ui/StatusDot';

export function AgentStatusPill({ status, connected }: { status: AgentStatus | null; connected: boolean }) {
  const { theme } = useTheme();
  const state = status?.state || 'IDLE';
  const tone = state === 'SCANNING' ? theme.amber : connected ? theme.green : theme.red;

  return (
    <View style={[styles.wrapper, { backgroundColor: theme.bgSoft, borderColor: theme.border }]}>
      <View style={styles.left}>
        <StatusDot color={tone} />
        <View>
          <Text style={[styles.title, { color: theme.textPrimary }]}>{connected ? state : 'DISCONNECTED'}</Text>
          <Text style={[styles.detail, { color: theme.textMuted }]}>{status?.currentTask || 'Waiting for next scan cycle'}</Text>
        </View>
      </View>
      <Badge
        label={`${status?.tasksCompleted || 0} tasks`}
        tone={connected ? 'positive' : 'negative'}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  title: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
  },
  detail: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    marginTop: 2,
  },
});
