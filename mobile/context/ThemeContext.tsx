import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { ColorSchemeName, useColorScheme } from 'react-native';
import { getStoredTheme, setStoredTheme } from '../lib/storage';
import { colors, resolveTheme } from '../lib/theme';

type ThemeMode = 'dark' | 'light' | 'system';

interface ThemeContextValue {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => Promise<void>;
  systemScheme: ColorSchemeName;
  theme: typeof colors.dark;
}

const ThemeContext = createContext<ThemeContextValue>({
  mode: 'system',
  setMode: async () => {},
  systemScheme: 'dark',
  theme: colors.dark,
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('system');

  useEffect(() => {
    getStoredTheme().then((stored) => {
      if (stored === 'dark' || stored === 'light' || stored === 'system') {
        setModeState(stored);
      }
    }).catch(() => {});
  }, []);

  const setMode = async (nextMode: ThemeMode) => {
    setModeState(nextMode);
    await setStoredTheme(nextMode);
  };

  const value = useMemo(() => ({
    mode,
    setMode,
    systemScheme,
    theme: resolveTheme(mode, systemScheme),
  }), [mode, systemScheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
