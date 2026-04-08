import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { addPushToken, removePushToken } from '../config/firebase';
import { updateAppsFlyerPushToken } from './appsflyer';

const PUSH_TOKEN_OWNER_KEY = '@picklego_push_token_owner';

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

export async function requestPushPermissions(): Promise<{ granted: boolean; canAskAgain: boolean }> {
  if (!Device.isDevice) {
    console.log('Push notifications require a physical device');
    return { granted: false, canAskAgain: true };
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  if (existingStatus === 'granted') return { granted: true, canAskAgain: true };

  const { status, canAskAgain } = await Notifications.requestPermissionsAsync();
  return { granted: status === 'granted', canAskAgain: canAskAgain ?? true };
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
  const { granted } = await requestPushPermissions();
  if (!granted) return null;

  const token = await getDevicePushToken();
  if (!token) return null;

  try {
    // Remove token from previous owner if a different user signed in on this device
    const previousOwner = await AsyncStorage.getItem(PUSH_TOKEN_OWNER_KEY);
    if (previousOwner && previousOwner !== playerId) {
      try {
        await removePushToken(previousOwner, token);
      } catch {
        // Best effort — previous player doc may not exist
      }
    }

    await addPushToken(playerId, token);
    await AsyncStorage.setItem(PUSH_TOKEN_OWNER_KEY, playerId);
    updateAppsFlyerPushToken(token);
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
