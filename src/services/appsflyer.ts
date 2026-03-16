import appsflyer from 'react-native-appsflyer';
import AsyncStorage from '@react-native-async-storage/async-storage';

export function initAppsFlyer() {
  appsflyer.initSdk({
    devKey: process.env.EXPO_PUBLIC_APPSFLYER_DEV_KEY ?? '',
    isDebug: __DEV__,
    appId: '6743630735',
    onInstallConversionDataListener: true,
    onDeepLinkListener: true,
  });

  // Handle deferred deep links (user installs app after clicking link)
  appsflyer.onInstallConversionData((data) => {
    if (data?.data?.af_dp) {
      handleDeepLinkUrl(data.data.af_dp);
    }
  });

  // Handle direct deep links (app already installed)
  appsflyer.onDeepLink((res) => {
    if (res?.deepLinkStatus === 'FOUND') {
      const inviteId = res.data?.inviteId || res.data?.deep_link_value;
      if (inviteId) {
        AsyncStorage.setItem('pendingSMSInviteId', inviteId);
      }
    }
  });
}

function handleDeepLinkUrl(url: string) {
  const match = url.match(/invite\/([a-zA-Z0-9_-]+)/);
  if (match?.[1]) {
    AsyncStorage.setItem('pendingSMSInviteId', match[1]);
  }
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
      (link) => resolve(link),
      () => resolve(`picklego://invite/${inviteId}`), // fallback
    );
  });
}
