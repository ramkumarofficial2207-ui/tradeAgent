import { Tabs, useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable } from 'react-native';
import { useTheme } from '../../context/ThemeContext';

export default function TabsLayout() {
  const { theme } = useTheme();
  const router = useRouter();

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: theme.bgPrimary },
        headerTintColor: theme.textPrimary,
        headerShadowVisible: false,
        sceneStyle: { backgroundColor: theme.bgPrimary },
        tabBarStyle: {
          backgroundColor: theme.bgCard,
          borderTopColor: theme.border,
        },
        tabBarActiveTintColor: theme.blue,
        tabBarInactiveTintColor: theme.textMuted,
        headerRight: () => (
          <Pressable onPress={() => router.push('/profile')} style={{ paddingRight: 8 }}>
            <Ionicons name="person-circle-outline" size={24} color={theme.textPrimary} />
          </Pressable>
        ),
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Dashboard', tabBarIcon: ({ color, size }) => <Ionicons name="grid-outline" size={size} color={color} /> }} />
      <Tabs.Screen name="watchlist" options={{ title: 'Watchlist', tabBarIcon: ({ color, size }) => <Ionicons name="bookmark-outline" size={size} color={color} /> }} />
      <Tabs.Screen name="portfolio" options={{ title: 'Portfolio', tabBarIcon: ({ color, size }) => <Ionicons name="pie-chart-outline" size={size} color={color} /> }} />
      <Tabs.Screen name="chat" options={{ title: 'AI Chat', tabBarIcon: ({ color, size }) => <Ionicons name="sparkles-outline" size={size} color={color} /> }} />
    </Tabs>
  );
}
