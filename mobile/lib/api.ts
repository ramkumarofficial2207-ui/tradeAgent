import axios from 'axios';
import Constants from 'expo-constants';
import { getStoredToken } from './storage';

export function getApiBaseUrl() {
  const envUrl = process.env.EXPO_PUBLIC_API_BASE_URL;
  const configUrl = (Constants.expoConfig?.extra as { apiBaseUrl?: string } | undefined)?.apiBaseUrl;
  return envUrl || configUrl || 'https://your-app.railway.app';
}

export const api = axios.create({
  baseURL: getApiBaseUrl(),
  timeout: 30000,
});

let authToken: string | null = null;

export function setApiToken(token: string | null) {
  authToken = token;
  if (token) {
    api.defaults.headers.common.Authorization = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common.Authorization;
  }
}

api.interceptors.request.use(async (config) => {
  const token = authToken ?? await getStoredToken();
  if (token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});
