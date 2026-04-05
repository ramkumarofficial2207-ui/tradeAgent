import AsyncStorage from '@react-native-async-storage/async-storage';

const TOKEN_KEY = 'stocksage_token';
const THEME_KEY = 'stocksage_theme';
const MPIN_LOGIN_KEY = 'stocksage_bio_enabled';

export async function getStoredToken() {
  return AsyncStorage.getItem(TOKEN_KEY);
}

export async function setStoredToken(token: string) {
  return AsyncStorage.setItem(TOKEN_KEY, token);
}

export async function clearStoredToken() {
  return AsyncStorage.removeItem(TOKEN_KEY);
}

export async function getStoredTheme() {
  return AsyncStorage.getItem(THEME_KEY);
}

export async function setStoredTheme(value: string) {
  return AsyncStorage.setItem(THEME_KEY, value);
}

export async function getBiometricPreference() {
  return AsyncStorage.getItem(MPIN_LOGIN_KEY);
}

export async function setBiometricPreference(enabled: boolean) {
  return AsyncStorage.setItem(MPIN_LOGIN_KEY, enabled ? 'true' : 'false');
}
