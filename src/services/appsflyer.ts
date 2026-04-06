import appsflyer from 'react-native-appsflyer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { navigateToMatchIfReady } from '../navigation/navigationRef';
import { handleDeepLinkUrl } from '../utils/deepLink';

export function initAppsFlyer() {
  appsflyer.initSdk({
    devKey: process.env.EXPO_PUBLIC_APPSFLYER_DEV_KEY ?? '',
    isDebug: __DEV__,
    appId: '6743630735',
    onInstallConversionDataListener: true,
    onDeepLinkListener: true,
  });

  appsflyer.setAppInviteOneLinkID('tb9Z');

  // Handle deferred deep links (user installs app after clicking link)
  appsflyer.onInstallConversionData((data: any) => {
    if (data?.data?.af_dp) {
      handleDeepLinkUrl(data.data.af_dp);
    } else if (data?.data?.openMatchId) {
      const matchId = data.data.openMatchId;
      AsyncStorage.setItem('pendingOpenMatchId', matchId);
      navigateToMatchIfReady(matchId);
    }
  });

  // Handle direct deep links (app already installed)
  appsflyer.onDeepLink((res: any) => {
    if (res?.deepLinkStatus === 'FOUND') {
      const openMatchId = res.data?.openMatchId;
      if (openMatchId) {
        AsyncStorage.setItem('pendingOpenMatchId', openMatchId);
        navigateToMatchIfReady(openMatchId);
        return;
      }
      const inviteId = res.data?.inviteId || res.data?.deep_link_value;
      if (inviteId) {
        AsyncStorage.setItem('pendingSMSInviteId', inviteId);
      }
    }
  });
}

// handleDeepLinkUrl is now imported from ../utils/deepLink

export function setAppsFlyerUserId(userId: string) {
  appsflyer.setCustomerUserId(userId);
}

export function logAppsFlyerEvent(eventName: string, eventValues: Record<string, string> = {}) {
  appsflyer.logEvent(eventName, eventValues);
}

export function updateAppsFlyerPushToken(token: string) {
  appsflyer.updateServerUninstallToken(token);
}

export async function generateOpenMatchLink(matchId: string): Promise<string> {
  return new Promise((resolve) => {
    appsflyer.generateInviteLink(
      {
        channel: 'match_invite',
        campaign: 'open_match',
        customerID: matchId,
        userParams: {
          openMatchId: matchId,
          deep_link_value: matchId,
        },
      },
      (link: string) => resolve(link),
      () => resolve(`picklego://open-match/${matchId}`),
    );
  });
}

export async function generateOneLink(inviteId: string): Promise<string> {
  return new Promise((resolve) => {
    appsflyer.generateInviteLink(
      {
        channel: 'sms',
        campaign: 'invite',
        customerID: inviteId,
        userParams: {
          inviteId,
          deep_link_value: inviteId,
        },
      },
      (link: string) => resolve(link),
      () => resolve(`picklego://invite/${inviteId}`), // fallback
    );
  });
}
