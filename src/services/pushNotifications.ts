import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import messaging from '@react-native-firebase/messaging';
import { addFcmToken, removeFcmToken } from '../config/firebase';

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

  const authStatus = await messaging().requestPermission();
  return (
    authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
    authStatus === messaging.AuthorizationStatus.PROVISIONAL
  );
}

export async function getDevicePushToken(): Promise<string | null> {
  if (!Device.isDevice) return null;

  try {
    const token = await messaging().getToken();
    return token;
  } catch (error) {
    console.error('Error getting FCM token:', error);
    return null;
  }
}

export async function registerPushToken(playerId: string): Promise<string | null> {
  const granted = await requestPushPermissions();
  if (!granted) return null;

  const token = await getDevicePushToken();
  if (!token) return null;

  try {
    await addFcmToken(playerId, token);
    return token;
  } catch (error) {
    console.error('Error storing push token:', error);
    return null;
  }
}

export async function removePushToken(playerId: string): Promise<void> {
  const token = await getDevicePushToken();
  if (!token) return;

  try {
    await removeFcmToken(playerId, token);
  } catch (error) {
    console.error('Error removing push token:', error);
  }
}
