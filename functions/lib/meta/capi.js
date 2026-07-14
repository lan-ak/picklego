"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendAppEvent = sendAppEvent;
const crypto_1 = require("crypto");
const firestore_1 = require("firebase-admin/firestore");
const phone_1 = require("../phone");
const graph_1 = require("./graph");
/** Meta requires PII to be SHA-256 hashed, over a normalized value. */
function hash(value) {
    return (0, crypto_1.createHash)('sha256').update(value.trim().toLowerCase()).digest('hex');
}
/**
 * Phone numbers hash as digits **including the country code**.
 *
 * This used to be a bare `value.replace(/\D/g, '')`. Combined with `players.phoneNumber`
 * holding a display string — which for the default US country is "5551234567", no leading
 * 1 — every US number hashed to a value Meta has no record of. The `ph` signal was being
 * sent, accepted, and matched against nothing.
 */
function hashPhone(value) {
    return (0, crypto_1.createHash)('sha256').update((0, phone_1.normalizePhone)(value)).digest('hex');
}
/** Meta 5xx and 429 are transient. Everything else is our bug and retrying just repeats it. */
function isRetryable(status) {
    return status >= 500 || status === 429;
}
const MAX_ATTEMPTS = 3;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
/**
 * Park an event Meta never accepted, so it can be replayed.
 *
 * Without this a Meta outage or an expired token drops purchase events permanently, and
 * the only trace is a log line nobody reads. Purchases are the events the whole
 * integration exists for — they are the last thing that should be fire-and-forget.
 */
async function deadLetter(input, reason) {
    try {
        await (0, firestore_1.getFirestore)()
            .collection('metaCapiFailures')
            .doc(`${input.eventName}:${input.eventId}`) // deterministic → a redelivery overwrites
            .set({
            event: input,
            reason: typeof reason === 'string' ? reason : JSON.stringify(reason),
            failedAt: Date.now(),
        });
    }
    catch (error) {
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
async function sendAppEvent(input, datasetId, accessToken) {
    const { metaContext } = input;
    const userData = {};
    if (metaContext?.advertiserId)
        userData.madid = metaContext.advertiserId;
    if (metaContext?.anonId)
        userData.anon_id = metaContext.anonId;
    if (input.playerId)
        userData.extern_id = hash(input.playerId);
    if (input.email)
        userData.em = hash(input.email);
    if (input.phone)
        userData.ph = hashPhone(input.phone);
    // The webhook already loaded the player doc, so fn/ln cost nothing and every extra
    // matched field raises the odds Meta can attribute this purchase to an ad click —
    // which matters most for the users who denied ATT and have no madid at all.
    if (input.name) {
        const [first, ...rest] = input.name.trim().split(/\s+/).filter(Boolean);
        if (first)
            userData.fn = hash(first);
        if (rest.length)
            userData.ln = hash(rest.join(' '));
    }
    const event = {
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
    const url = `${graph_1.GRAPH_HOST}/${graph_1.GRAPH_VERSION}/${datasetId}/events`;
    const payload = {
        data: [event],
        access_token: accessToken,
    };
    if (input.testEventCode)
        payload.test_event_code = input.testEventCode;
    let lastFailure = 'unknown';
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
                if (!retryable)
                    break;
            }
            else {
                const result = body;
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
        }
        catch (error) {
            lastFailure = error.message;
            console.error('[MetaCAPI] request failed', {
                attempt,
                eventName: input.eventName,
                eventId: input.eventId,
                error,
            });
        }
        if (attempt < MAX_ATTEMPTS)
            await sleep(500 * 2 ** (attempt - 1));
    }
    await deadLetter(input, lastFailure);
    return false;
}
//# sourceMappingURL=capi.js.map