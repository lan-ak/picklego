import { Platform, Dimensions, PixelRatio } from 'react-native';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { getLocales, getCalendars } from 'expo-localization';
import { Settings, AppEventsLogger, type UserData } from 'react-native-fbsdk-next';
import {
  whenTrackingResolved,
  settleTrackingIfAlreadyAnswered,
  isTrackingSettled,
} from './tracking';
import type { MetaContext } from '../types';

/** How long to keep watching for a late ATT answer after the SDK has already come up. */
const LATE_ATT_TIMEOUT_MS = 5 * 60_000;

/**
 * Meta (Facebook) App Events — attribution and conversion tracking only.
 * No Facebook Login: LoginManager is deliberately never imported.
 *
 * Init order matters. The SDK is configured with isAutoInitEnabled:false so that
 * we can set the advertiser-tracking flag from the ATT result *before* calling
 * initializeSDK() — that is what makes the very first fb_mobile_activate_app
 * (the install event) carry the correct flag. Events logged before that point are
 * queued here and flushed on init rather than dropped.
 */

const META_ENABLED = !!process.env.EXPO_PUBLIC_META_APP_ID;

type QueuedCall =
  | { kind: 'event'; name: string; params: Params }
  | { kind: 'userId'; userId: string | null }
  | { kind: 'userData'; data: UserData };

type Params = Record<string, string | number>;

let initialized = false;
let queue: QueuedCall[] = [];

/**
 * Meta's standard event names, as literals.
 *
 * Deliberately NOT AppEventsLogger.AppEvents.* — those are populated from the
 * native module's getConstants(), which resolves to {} if the native module is
 * missing (env-gated off, or a bridgeless resolution failure). Every constant
 * would silently become undefined and we'd call logEvent(undefined). The values
 * below are frozen Meta API contract.
 */
export const MetaEvents = {
  CompletedRegistration: 'fb_mobile_complete_registration',
  CompletedTutorial: 'fb_mobile_tutorial_completion',
  AddedToCart: 'fb_mobile_add_to_cart',
  StartTrial: 'StartTrial',
  Subscribe: 'Subscribe',
} as const;

export const MetaParams = {
  ContentID: 'fb_content_id',
  ContentType: 'fb_content_type',
  RegistrationMethod: 'fb_registration_method',
  Description: 'fb_description',
  NumItems: 'fb_num_items',
} as const;

function sendEvent(name: string, params: Params) {
  try {
    AppEventsLogger.logEvent(name, params);
  } catch (error) {
    console.warn('[Meta] logEvent failed', name, error);
  }
}

function drainQueue() {
  const pending = queue;
  queue = [];

  for (const call of pending) {
    switch (call.kind) {
      case 'event':
        sendEvent(call.name, call.params);
        break;
      case 'userId':
        try {
          AppEventsLogger.setUserID(call.userId);
        } catch (error) {
          console.warn('[Meta] setUserID failed', error);
        }
        break;
      case 'userData':
        try {
          AppEventsLogger.setUserData(call.data);
        } catch (error) {
          console.warn('[Meta] setUserData failed', error);
        }
        break;
    }
  }
}

/** iOS 14.5+ gates the IDFA behind this flag. Must be set before initializeSDK(). */
async function applyTrackingFlag(granted: boolean): Promise<void> {
  if (Platform.OS === 'ios') {
    await Settings.setAdvertiserTrackingEnabled(granted);
  }
  Settings.setAdvertiserIDCollectionEnabled(granted);
}

/** Fire-and-forget. Safe to call at module scope; never throws, never blocks render. */
export function initMeta(): void {
  if (!META_ENABLED || initialized) return;

  // Nothing initializes until ATT resolves, and an unanswered prompt is silent: events
  // queue, no error is thrown, and Events Manager stays empty. That is the single most
  // confusing state this file can be in, so in dev it announces itself.
  if (__DEV__) {
    setTimeout(() => {
      if (!initialized) {
        console.warn(
          `[Meta] still not initialized after 10s — ${queue.length} event(s) queued, unsent.\n` +
            '  The SDK waits for the ATT prompt before it starts. Answer it (TrackingPrimer, at\n' +
            '  cold start) and this clears. Until then nothing reaches Meta. Call metaDebugStatus()\n' +
            '  for the full picture.',
        );
      }
    }, 10_000);
  }

  void (async () => {
    try {
      // Resolve ATT from a non-render path. The gate was previously settled only by
      // TrackingPrimer, which sits behind App's `if (!fontsLoaded) return null` — so a
      // font-load stall left it hanging until the 60s timeout, and the SDK then came up
      // with tracking disabled for the whole session.
      void settleTrackingIfAlreadyAnswered();

      const granted = await whenTrackingResolved();

      await applyTrackingFlag(granted);
      Settings.setAutoLogAppEventsEnabled(true);

      Settings.initializeSDK();
      initialized = true;
      drainQueue();

      if (__DEV__) {
        console.log(`[Meta] initialized (ATT granted=${granted})`);
        // Push the queued startup events (install, activate_app, anything fired during
        // onboarding) out immediately. Without this the SDK sits on them for ~15s, which
        // while you are staring at Events Manager is indistinguishable from a dead
        // integration. Dev only — batching is the right behaviour in production.
        flushMeta();
      }

      // We may have initialized on the timeout rather than on a real answer — the user
      // could still be sitting on the ATT dialog. The flag is otherwise written exactly
      // once, so without this a late "Allow" would be discarded for the rest of the launch.
      if (!isTrackingSettled()) {
        const late = await whenTrackingResolved(LATE_ATT_TIMEOUT_MS);
        if (late !== granted) {
          await applyTrackingFlag(late);
          if (__DEV__) console.log(`[Meta] ATT answered late — flag updated to ${late}`);
        }
      }
    } catch (error) {
      console.warn('[Meta] init failed', error);
    }
  })();
}

export function setMetaUserId(userId: string | null): void {
  if (!META_ENABLED) return;
  if (!initialized) {
    queue.push({ kind: 'userId', userId });
    return;
  }
  try {
    AppEventsLogger.setUserID(userId);
  } catch (error) {
    console.warn('[Meta] setUserID failed', error);
  }
}

/**
 * Advanced Matching. Meta hashes these on-device before upload.
 *
 * This is the main lever on attribution quality: for the majority of users who
 * deny ATT there is no IDFA, and this is what still lets Meta tie an event back
 * to an ad click. Requires Advanced Matching to be enabled in Events Manager.
 */
export function setMetaUserData(data: UserData): void {
  if (!META_ENABLED) return;
  if (!initialized) {
    queue.push({ kind: 'userData', data });
    return;
  }
  try {
    AppEventsLogger.setUserData(data);
  } catch (error) {
    console.warn('[Meta] setUserData failed', error);
  }
}

/**
 * Drop the signed-in identity: the user id AND the Advanced Matching payload.
 *
 * Clearing only the user id is not enough. setUserData is sticky inside the SDK, so the
 * previous user's hashed email / phone / name would stay attached and be sent with the
 * NEXT user's events on a shared device — silently corrupting attribution for both.
 *
 * react-native-fbsdk-next does not bridge the native clearUserData(), so the empty-object
 * write is the way to reach it.
 */
export function clearMetaUser(): void {
  if (!META_ENABLED) return;
  try {
    AppEventsLogger.setUserID(null);
    AppEventsLogger.setUserData({});
  } catch (error) {
    console.warn('[Meta] clearUser failed', error);
  }
}

export function logMetaEvent(eventName: string, params: Params = {}): void {
  if (!META_ENABLED) return;
  if (!initialized) {
    queue.push({ kind: 'event', name: eventName, params });
    return;
  }
  sendEvent(eventName, params);
}

/**
 * There is deliberately NO logMetaPurchase here.
 *
 * Meta purchases are sent server-side only, from the Superwall webhook (functions/src/meta).
 * FBSDK's logPurchase() cannot set an event_id, so a client purchase and the server's
 * Conversions API purchase could never be deduplicated and revenue would double-count.
 * The server path also catches renewals, which the client never sees at all.
 *
 * A logMetaPurchase() wrapper used to sit here, exported and called by nothing. Deleting it
 * is the point: it was one import away from silently breaking revenue reporting.
 */

/**
 * Force the event buffer out to Meta now.
 *
 * The SDK batches: it flushes roughly every 15 seconds, at 100 events, or when the app
 * backgrounds. So an event you just fired legitimately will NOT appear in Events Manager
 * straight away, and that looks exactly like a broken integration. Call this when you are
 * watching Test Events and want an answer in seconds rather than minutes.
 *
 * A no-op before the SDK has initialized — which itself is worth knowing, because until ATT
 * is answered nothing is initialized and every event is sitting in the queue below.
 */
export function flushMeta(): void {
  if (!META_ENABLED) return;
  try {
    AppEventsLogger.flush();
  } catch (error) {
    console.warn('[Meta] flush failed', error);
  }
}

/**
 * Why is nothing showing up in Events Manager? Answers the three questions that matter,
 * in order, without a native debugger.
 *
 * Dev-only by convention — it is a debugging aid, not telemetry.
 */
export async function metaDebugStatus(): Promise<Record<string, unknown>> {
  const status: Record<string, unknown> = {
    // false → EXPO_PUBLIC_META_APP_ID is missing from the bundle. Env vars are inlined at
    // BUILD time, so a .env edit needs a fresh native bundle, not just a Fast Refresh.
    enabled: META_ENABLED,
    // false → the SDK has not come up. Almost always: ATT has not been answered yet, so
    // initMeta() is still parked on whenTrackingResolved().
    initialized,
    // > 0 while uninitialized → events are being captured, not lost. They flush on init.
    queuedEvents: queue.length,
    trackingSettled: isTrackingSettled(),
  };

  try {
    // A non-null anonymous id is the SDK saying "I am really running". If this throws or
    // comes back null, the native module never bound — which no amount of JS will fix.
    status.anonId = await AppEventsLogger.getAnonymousID();
    status.advertiserId = await AppEventsLogger.getAdvertiserID();
  } catch (error) {
    status.nativeModuleError = String(error);
  }

  console.log('[Meta] status', status);
  return status;
}

/**
 * Meta's `extinfo` device array — a fixed 16-slot, position-sensitive list. It is
 * required on every Conversions API app event, and the order is Meta's, not ours.
 *
 * https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/app-data
 */
function buildExtinfo(): string[] {
  const { width, height } = Dimensions.get('screen');
  const density = PixelRatio.get();
  const locale = getLocales()[0];
  const timezone = getCalendars()[0]?.timeZone ?? '';

  return [
    Platform.OS === 'ios' ? 'i2' : 'a2',       // 0  extinfo version
    Constants.expoConfig?.ios?.bundleIdentifier ?? 'com.picklego.picklego', // 1  package name
    String(Constants.expoConfig?.ios?.buildNumber ?? ''),                   // 2  short version / build
    String(Constants.expoConfig?.version ?? ''),                            // 3  long version
    String(Device.osVersion ?? ''),            // 4  OS version
    String(Device.modelName ?? ''),            // 5  device model
    locale?.languageTag ?? '',                 // 6  locale
    // Meta wants a timezone abbreviation here; the IANA name is the closest thing
    // React Native exposes without pulling in a tz database.
    timezone,                                  // 7  timezone abbreviation
    '',                                        // 8  carrier (unavailable without a native module)
    String(width),                             // 9  screen width
    String(height),                            // 10 screen height
    density.toFixed(2),                        // 11 screen density
    '',                                        // 12 CPU cores (unavailable)
    '',                                        // 13 external storage GB (unavailable)
    '',                                        // 14 free space GB (unavailable)
    timezone,                                  // 15 device timezone
  ];
}

/**
 * Snapshot the device context the Conversions API needs. Safe to call before the
 * SDK finishes initializing — the IDs simply come back null, and we retry on the
 * next launch.
 *
 * `advertiserId` is an all-zeros UUID when ATT is denied. That's expected, and Meta
 * treats it as absent; we still send it rather than special-casing.
 */
export async function captureMetaDeviceContext(): Promise<MetaContext | null> {
  if (!META_ENABLED) return null;

  try {
    const [anonId, advertiserId] = await Promise.all([
      AppEventsLogger.getAnonymousID().catch(() => null),
      AppEventsLogger.getAdvertiserID().catch(() => null),
    ]);

    const advertiserTrackingEnabled = await whenTrackingResolved();

    return {
      ...(anonId ? { anonId } : {}),
      ...(advertiserId ? { advertiserId } : {}),
      advertiserTrackingEnabled,
      extinfo: buildExtinfo(),
      updatedAt: Date.now(),
    };
  } catch (error) {
    console.warn('[Meta] captureMetaDeviceContext failed', error);
    return null;
  }
}
