import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { Outfit_700Bold } from '@expo-google-fonts/outfit';
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold } from '@expo-google-fonts/inter';
import { JetBrainsMono_500Medium } from '@expo-google-fonts/jetbrains-mono';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { ThemeProvider, useTheme } from '../context/ThemeContext';

function RootNavigator() {
  const { user, loading } = useAuth();
  const { theme } = useTheme();
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    if (loading) return;
    const inAuthGroup = segments[0] === '(auth)';
    if (!user && !inAuthGroup) router.replace('/login');
    if (user && inAuthGroup) router.replace('/');
  }, [loading, user, segments, router]);

  if (loading) return null;

  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: theme.bgPrimary },
          headerTintColor: theme.textPrimary,
          headerShadowVisible: false,
          contentStyle: { backgroundColor: theme.bgPrimary },
        }}
      >
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="profile" options={{ title: 'Profile' }} />
        <Stack.Screen name="upgrade" options={{ title: 'Upgrade' }} />
        <Stack.Screen name="founder" options={{ title: 'Edge Lab' }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  const [loaded] = useFonts({
    Outfit_700Bold,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    JetBrainsMono_500Medium,
  });

  if (!loaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <AuthProvider>
            <RootNavigator />
          </AuthProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
