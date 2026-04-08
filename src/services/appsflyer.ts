import appsflyer from 'react-native-appsflyer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { navigateToMatchIfReady } from '../navigation/navigationRef';
import { handleDeepLinkUrl } from '../utils/deepLink';

export function initAppsFlyer() {
  appsflyer.setOneLinkCustomDomains(
    ['picklego.onelink.me'],
    () => {},
    () => {},
  );

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
    } else if (data?.data?.deep_link_value?.startsWith('open-match_')) {
      const matchId = data.data.deep_link_value.replace('open-match_', '');
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

      const deepLinkValue = res.data?.deep_link_value;

      // Check if deep_link_value carries an open match ID
      if (deepLinkValue && deepLinkValue.startsWith('open-match_')) {
        const matchId = deepLinkValue.replace('open-match_', '');
        AsyncStorage.setItem('pendingOpenMatchId', matchId);
        navigateToMatchIfReady(matchId);
        return;
      }

      // Otherwise treat as SMS invite
      const inviteId = res.data?.inviteId || deepLinkValue;
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
        af_dp: `picklego://open-match/${matchId}`,
        userParams: {
          openMatchId: matchId,
          deep_link_value: `open-match_${matchId}`,
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
