/**
 * Meta Conversions API — app events.
 *
 * This exists because the client SDK cannot see subscription renewals, which are
 * the bulk of subscription revenue. It is also the *only* place Meta purchases are
 * sent: FBSDK's logPurchase() can't set an event_id, so a client purchase and a
 * server purchase could never be deduplicated, and revenue would double-count.
 *
 * App events are stricter than web events — Meta requires app_data.extinfo plus
 * madid/anon_id, none of which a server can derive. The client captures them once
 * and denormalizes them onto the player doc (see src/services/meta.ts,
 * captureMetaDeviceContext), and we read them back here.
 *
 * https://developers.facebook.com/documentation/ads-commerce/conversions-api/app-events
 */

import { createHash } from 'crypto';
import { getFirestore } from 'firebase-admin/firestore';
import { normalizePhone } from '../phone';
import { GRAPH_HOST, GRAPH_VERSION } from './graph';

/**
 * Mirrors the MetaContext written by the client onto players/{id}.
 *
 * Kept in step with `MetaContext` in the app's src/types/index.ts by hand — the app and
 * functions are separate TS projects with separate roots, so the compiler cannot check it.
 * `extinfo` in particular is a 16-slot POSITIONAL array; if the two sides ever disagree
 * about a slot, nothing breaks loudly, Meta just quietly downgrades match quality.
 */
export interface MetaContext {
  anonId?: string;
  advertiserId?: string;
  advertiserTrackingEnabled: boolean;
  extinfo: string[];
  updatedAt: number;
}

export interface AppEventInput {
  eventName: string;
  /** Unix seconds. */
  eventTime: number;
  /** Idempotency key. Meta dedupes on (event_id, event_name). */
  eventId: string;
  value?: number;
  currency?: string;
  /** Firebase UID — sent as extern_id so Meta can match across sessions. */
  playerId?: string;
  email?: string;
  /** E.164, digits with country code. See hashPhone — a national-format number won't match. */
  phone?: string;
  /** Full name. Split and sent as fn/ln — free match quality, the webhook already has it. */
  name?: string;
  metaContext?: MetaContext;
  /**
   * Events Manager → Test Events code. When set, the event is routed to the Test
   * Events stream instead of counting as production data, and Meta echoes back any
   * validation warnings it would otherwise swallow.
   *
   * This is the only way to see what Meta actually does with an event — a rejected
   * app event looks identical to "no purchases yet" from the outside.
   */
  testEventCode?: string;
}

/** Meta requires PII to be SHA-256 hashed, over a normalized value. */
function hash(value: string): string {
  return createHash('sha256').update(value.trim().toLowerCase()).digest('hex');
}

/**
 * Phone numbers hash as digits **including the country code**.
 *
 * This used to be a bare `value.replace(/\D/g, '')`. Combined with `players.phoneNumber`
 * holding a display string — which for the default US country is "5551234567", no leading
 * 1 — every US number hashed to a value Meta has no record of. The `ph` signal was being
 * sent, accepted, and matched against nothing.
 */
function hashPhone(value: string): string {
  return createHash('sha256').update(normalizePhone(value)).digest('hex');
}

/** Meta 5xx and 429 are transient. Everything else is our bug and retrying just repeats it. */
function isRetryable(status: number): boolean {
  return status >= 500 || status === 429;
}

const MAX_ATTEMPTS = 3;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Park an event Meta never accepted, so it can be replayed.
 *
 * Without this a Meta outage or an expired token drops purchase events permanently, and
 * the only trace is a log line nobody reads. Purchases are the events the whole
 * integration exists for — they are the last thing that should be fire-and-forget.
 */
async function deadLetter(input: AppEventInput, reason: unknown): Promise<void> {
  try {
    await getFirestore()
      .collection('metaCapiFailures')
      .doc(`${input.eventName}:${input.eventId}`) // deterministic → a redelivery overwrites
      .set({
        event: input,
        reason: typeof reason === 'string' ? reason : JSON.stringify(reason),
        failedAt: Date.now(),
      });
  } catch (error) {
    // Firestore is down too. Nothing left but the log.
    console.error('[MetaCAPI] dead-letter write failed', input.eventId, error);
  }
}

/**
 * Send one app event. Never throws — a Meta outage must not take down the webhook.
 *
 * Retries transient failures, then dead-letters anything it could not deliver into
 * `metaCapiFailures` so it can be replayed. Returns whether Meta accepted it.
 */
export async function sendAppEvent(
  input: AppEventInput,
  datasetId: string,
  accessToken: string,
): Promise<boolean> {
  const { metaContext } = input;

  const userData: Record<string, unknown> = {};
  if (metaContext?.advertiserId) userData.madid = metaContext.advertiserId;
  if (metaContext?.anonId) userData.anon_id = metaContext.anonId;
  if (input.playerId) userData.extern_id = hash(input.playerId);
  if (input.email) userData.em = hash(input.email);
  if (input.phone) userData.ph = hashPhone(input.phone);

  // The webhook already loaded the player doc, so fn/ln cost nothing and every extra
  // matched field raises the odds Meta can attribute this purchase to an ad click —
  // which matters most for the users who denied ATT and have no madid at all.
  if (input.name) {
    const [first, ...rest] = input.name.trim().split(/\s+/).filter(Boolean);
    if (first) userData.fn = hash(first);
    if (rest.length) userData.ln = hash(rest.join(' '));
  }

  const event: Record<string, unknown> = {
    event_name: input.eventName,
    event_time: input.eventTime,
    event_id: input.eventId,
    action_source: 'app',
    user_data: userData,
  };

  if (input.value !== undefined && input.currency) {
    event.custom_data = { currency: input.currency, value: input.value };
  }

  // extinfo is required for app events. Without a context we still send — Meta
  // accepts the event with reduced match quality rather than rejecting it.
  if (metaContext) {
    event.app_data = {
      advertiser_tracking_enabled: metaContext.advertiserTrackingEnabled ? 1 : 0,
      application_tracking_enabled: 1,
      extinfo: metaContext.extinfo,
    };
  }

  const url = `${GRAPH_HOST}/${GRAPH_VERSION}/${datasetId}/events`;

  const payload: Record<string, unknown> = {
    data: [event],
    access_token: accessToken,
  };
  if (input.testEventCode) payload.test_event_code = input.testEventCode;

  let lastFailure: unknown = 'unknown';

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const body = await response.json();

      if (!response.ok) {
        lastFailure = body;
        const retryable = isRetryable(response.status);
        console.error('[MetaCAPI] rejected', {
          status: response.status,
          attempt,
          retryable,
          eventName: input.eventName,
          eventId: input.eventId,
          body,
        });
        // A 400 means the payload is wrong. Sending it again just gets the same 400.
        if (!retryable) break;
      } else {
        const result = body as { events_received?: number; messages?: unknown[] };

        // Meta answers 200 with a non-empty `messages` array for events it accepted but is
        // unhappy about — a bad hash, a missing required app_data, an unknown event name.
        // Swallowing these is exactly how a broken integration goes on looking healthy.
        if (result.messages?.length) {
          console.warn('[MetaCAPI] accepted with warnings', {
            eventName: input.eventName,
            eventId: input.eventId,
            messages: result.messages,
          });
        }

        console.log('[MetaCAPI] sent', {
          eventName: input.eventName,
          eventId: input.eventId,
          received: result.events_received,
          test: !!input.testEventCode,
        });
        return true;
      }
    } catch (error) {
      lastFailure = (error as Error).message;
      console.error('[MetaCAPI] request failed', {
        attempt,
        eventName: input.eventName,
        eventId: input.eventId,
        error,
      });
    }

    if (attempt < MAX_ATTEMPTS) await sleep(500 * 2 ** (attempt - 1));
  }

  await deadLetter(input, lastFailure);
  return false;
}
