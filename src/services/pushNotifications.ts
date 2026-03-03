import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { addPushToken, removePushToken } from '../config/firebase';

// Configure how notifications appear when the app is in the foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function requestPushPermissions(): Promise<boolean> {
  if (!Device.isDevice) {
    console.log('Push notifications require a physical device');
    return false;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  if (existingStatus === 'granted') return true;

  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

export async function getDevicePushToken(): Promise<string | null> {
  if (!Device.isDevice) return null;

  try {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    if (!projectId) {
      console.error('Missing EAS project ID for push token');
      return null;
    }
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    return token;
  } catch (error) {
    console.error('Error getting Expo push token:', error);
    return null;
  }
}

export async function registerPushToken(playerId: string): Promise<string | null> {
  const granted = await requestPushPermissions();
  if (!granted) return null;

  const token = await getDevicePushToken();
  if (!token) return null;

  try {
    await addPushToken(playerId, token);
    return token;
  } catch (error) {
    console.error('Error storing push token:', error);
    return null;
  }
}

export async function unregisterPushToken(playerId: string): Promise<void> {
  const token = await getDevicePushToken();
  if (!token) return;

  try {
    await removePushToken(playerId, token);
  } catch (error) {
    console.error('Error removing push token:', error);
  }
}
