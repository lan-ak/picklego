import { Platform } from 'react-native';
import {
  getTrackingPermissionsAsync,
  requestTrackingPermissionsAsync,
} from 'expo-tracking-transparency';

/**
 * App Tracking Transparency — the single source of truth for whether we may track.
 *
 * Both attribution SDKs depend on this resolving as early as possible after cold
 * start, because each holds its install postback until it does: AppsFlyer natively
 * via timeToWaitForATTUserAuthorization, Meta via the gate below.
 */

let settleGate: (granted: boolean) => void;
const attGate = new Promise<boolean>((resolve) => {
  settleGate = resolve;
});
let settled = false;

function settle(granted: boolean) {
  if (settled) return;
  settled = true;
  settleGate(granted);
}

/** Await the ATT outcome. Times out rather than hanging SDK init forever. */
export function whenTrackingResolved(timeoutMs = 60_000): Promise<boolean> {
  return Promise.race([
    attGate,
    new Promise<boolean>((resolve) => setTimeout(() => resolve(false), timeoutMs)),
  ]);
}

/**
 * Settle the gate without showing anything.
 *
 * The gate used to be settled only by TrackingPrimer, which renders behind App's
 * `if (!fontsLoaded) return null`. A font-load stall therefore stranded it: initMeta()
 * would wait out its 60s timeout and initialize with advertiserTrackingEnabled=false —
 * permanently for that launch, because the flag is only ever set once, before init.
 *
 * Called at module scope so the already-answered and non-iOS cases resolve immediately,
 * independent of the render tree. It never prompts: an undetermined status is left alone
 * for TrackingPrimer to prime and ask properly.
 */
export async function settleTrackingIfAlreadyAnswered(): Promise<void> {
  if (Platform.OS !== 'ios') {
    settle(true);
    return;
  }
  try {
    const { status } = await getTrackingPermissionsAsync();
    if (status !== 'undetermined') settle(status === 'granted');
  } catch {
    // Leave it unsettled — requestTrackingOnce or the timeout will resolve it.
  }
}

/** Whether ATT has resolved yet. Lets callers re-apply the flag after a late answer. */
export function isTrackingSettled(): boolean {
  return settled;
}

/** True only if the system prompt has never been answered. */
export async function isTrackingUndetermined(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  try {
    const { status } = await getTrackingPermissionsAsync();
    return status === 'undetermined';
  } catch {
    return false;
  }
}

/**
 * Show the system ATT dialog. Idempotent — safe to call on every launch; it only
 * prompts when the status is still undetermined, and resolves the gate either way.
 *
 * Non-iOS platforms have no ATT, so the gate settles true immediately.
 */
export async function requestTrackingOnce(): Promise<boolean> {
  if (Platform.OS !== 'ios') {
    settle(true);
    return true;
  }

  try {
    const current = await getTrackingPermissionsAsync();
    if (current.status !== 'undetermined') {
      const granted = current.status === 'granted';
      settle(granted);
      return granted;
    }

    const { status } = await requestTrackingPermissionsAsync();
    const granted = status === 'granted';
    settle(granted);
    return granted;
  } catch (error) {
    console.warn('[ATT] permission request failed', error);
    settle(false);
    return false;
  }
}
