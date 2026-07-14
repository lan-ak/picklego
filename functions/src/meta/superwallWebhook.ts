import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret, defineString } from 'firebase-functions/params';
import { getFirestore } from 'firebase-admin/firestore';
import { Webhook } from 'svix';
import { sendAppEvent, type MetaContext } from './capi';

/**
 * Superwall → Meta Conversions API bridge.
 *
 * Superwall does not forward purchases to Meta itself: its Facebook integration is
 * browser-side Pixel for Web2App paywalls only, and does not cover native StoreKit.
 * This is also the single source of Meta purchase events — see capi.ts for why the
 * client can't send them.
 *
 * Superwall signs webhooks with Svix. Verification runs against the RAW body, so the
 * parsed req.body must not be used for it.
 */

const META_DATASET_ID = defineSecret('META_DATASET_ID');
const META_CAPI_TOKEN = defineSecret('META_CAPI_TOKEN');
const SUPERWALL_WEBHOOK_SECRET = defineSecret('SUPERWALL_WEBHOOK_SECRET');

/**
 * Optional. When non-empty, every event is routed to Events Manager → Test Events
 * instead of counting as production data.
 *
 * A plain param, not a secret: the code is a short-lived debug token that identifies
 * a Test Events pane, not a credential — and an optional `defineSecret` would fail the
 * deploy whenever the secret didn't exist. Set it in `functions/.env` to validate the
 * integration, then remove it.
 */
const META_TEST_EVENT_CODE = defineString('META_TEST_EVENT_CODE', { default: '' });

/** Superwall events that represent money actually changing hands. */
const REVENUE_EVENTS = new Set([
  'initial_purchase',
  'renewal',
  'trial_conversion',
  'non_renewing_purchase',
]);

interface SuperwallEventPayload {
  type: string;
  data?: {
    id?: string;
    price?: number;
    currencyCode?: string;
    productId?: string;
    appUserId?: string;
    originalAppUserId?: string;
    purchasedAt?: number;
  };
}

export const superwallWebhook = onRequest(
  {
    secrets: [META_DATASET_ID, META_CAPI_TOKEN, SUPERWALL_WEBHOOK_SECRET],
    cors: false,
  },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).send('Method Not Allowed');
      return;
    }

    // Verify against the raw body — Svix signs the exact bytes Superwall sent.
    let event: SuperwallEventPayload;
    try {
      const webhook = new Webhook(SUPERWALL_WEBHOOK_SECRET.value());
      event = webhook.verify(req.rawBody.toString('utf8'), {
        'svix-id': String(req.headers['svix-id'] ?? ''),
        'svix-timestamp': String(req.headers['svix-timestamp'] ?? ''),
        'svix-signature': String(req.headers['svix-signature'] ?? ''),
      }) as SuperwallEventPayload;
    } catch (error) {
      console.warn('[SuperwallWebhook] signature verification failed', error);
      res.status(400).send('Invalid signature');
      return;
    }

    // Do the work, THEN acknowledge.
    //
    // Responding first looks like a latency win but isn't: on Cloud Run the instance's CPU
    // is throttled to near-zero once the response is sent, so the Firestore read and the
    // Meta POST that followed were not guaranteed to run at all. Superwall does not retry
    // a 200, and sendAppEvent doesn't throw, so anything lost that way was lost for good.
    // Meta's p99 sits well inside the webhook deadline, so there is nothing to buy here.
    try {
      await forwardToMeta(event);
    } catch (error) {
      console.error('[SuperwallWebhook] forwarding failed', error);
    }

    res.status(200).send('OK');
  },
);

async function forwardToMeta(event: SuperwallEventPayload) {
  const { type, data } = event;

  if (!REVENUE_EVENTS.has(type)) {
    // Logged WITH the type on purpose. REVENUE_EVENTS is our assumption about Superwall's
    // taxonomy; if that assumption is wrong then every event lands here, and this line is
    // the only way anyone would ever find out — a silently-ignored purchase is
    // indistinguishable from having no purchases.
    console.log('[SuperwallWebhook] non-revenue event, ignoring', { type });
    return;
  }

  if (!data || data.price === undefined) {
    // A revenue event we can't read is a payload-shape mismatch, not a business case.
    console.warn('[SuperwallWebhook] revenue event with no usable price — has the payload shape changed?', {
      type,
      keys: data ? Object.keys(data) : null,
    });
    return;
  }

  const price = data.price ?? 0;

  // Negative price means a refund. Meta rejects negative purchase values, and there
  // is no standard app event for a refund, so drop it.
  if (price <= 0) {
    console.log('[SuperwallWebhook] skipping non-positive price', { type, price });
    return;
  }

  // appUserId is the Firebase UID — useSuperwallIdentity calls identify(user.id).
  // originalAppUserId falls back to a Superwall alias for users who were never
  // identified, which we can't map to a player.
  const playerId = data.appUserId ?? data.originalAppUserId;
  const isAlias = !playerId || playerId.startsWith('$SuperwallAlias:');

  let metaContext: MetaContext | undefined;
  let email: string | undefined;
  let phone: string | undefined;
  let name: string | undefined;

  if (playerId && !isAlias) {
    const snap = await getFirestore().collection('players').doc(playerId).get();
    const player = snap.data();
    if (player) {
      metaContext = player.metaContext as MetaContext | undefined;
      email = player.email as string | undefined;
      // Prefer the normalized E.164 number. players.phoneNumber is a DISPLAY string
      // ("5551234567" for a US user, no country code) and hashing that never matches Meta.
      phone = (player.phoneNumberE164 ?? player.phoneNumber) as string | undefined;
      name = player.name as string | undefined;
    }
  }

  if (!metaContext) {
    // Still worth sending — Advanced Matching on the hashed email can attribute it,
    // just with lower match quality than a madid would give.
    console.warn('[SuperwallWebhook] no metaContext for player', { playerId, type });
  }

  // Superwall's own event id is the idempotency key, so a redelivery dedupes at Meta.
  // The fallback has to stay unique per user AND per purchase: `${type}:${productId}:${at}`
  // collapsed to "renewal:undefined:undefined" whenever both fields were absent, which
  // would have made Meta dedupe two different people's purchases into one.
  const eventId =
    data.id ??
    [type, playerId ?? 'anon', data.productId ?? 'unknown', data.purchasedAt ?? 'unknown'].join(':');

  const sent = await sendAppEvent(
    {
      eventName: 'Purchase',
      // Superwall timestamps are milliseconds; Meta wants Unix seconds.
      eventTime: Math.floor((data.purchasedAt ?? Date.now()) / 1000),
      eventId,
      value: price,
      // Meta expects an ISO-4217 code; it is case-sensitive on the way in.
      currency: (data.currencyCode ?? 'USD').toUpperCase(),
      playerId: isAlias ? undefined : playerId,
      email,
      phone,
      name,
      metaContext,
      testEventCode: META_TEST_EVENT_CODE.value() || undefined,
    },
    META_DATASET_ID.value(),
    META_CAPI_TOKEN.value(),
  );

  if (!sent) {
    console.error('[SuperwallWebhook] Meta did not accept the purchase; parked for replay', {
      type,
      eventId,
    });
  }
}
