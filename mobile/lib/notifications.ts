import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { api } from './api';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function registerForPushNotifications() {
  if (!Device.isDevice) return null;

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') return null;

  try {
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ||
      Constants.easConfig?.projectId;
    const token = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    return token.data;
  } catch {
    return null;
  }
}

export async function syncPushTokenToBackend(platform: 'ios' | 'android') {
  const pushToken = await registerForPushNotifications();
  if (!pushToken) return null;
  await api.post('/api/notifications/register-device', { pushToken, platform });
  return pushToken;
}
