/**
 * promoted_object — the thing being advertised.
 *
 * Built from env, never from a flag. It is IMMUTABLE once a campaign is live (subcode
 * 2446698), so a typo here is not a bug you fix, it is a campaign you delete and
 * recreate — and each app only gets 9 SKAdNetwork campaign slots.
 */
import { Config, require_ } from './env';
import { ValidationError } from './errors';

export interface PromotedObject {
  application_id: string;
  object_store_url: string;
  custom_event_type?: string;
  custom_event_str?: string;
}

export function promotedObject(config: Config, customEventType?: string, customEventStr?: string): PromotedObject {
  const url = require_(config, 'objectStoreUrl');

  // SKAdNetwork requires an iTunes URL with a readable numeric app id (subcodes 2446699,
  // 2446700, 2490250). Failing here beats failing three API calls later.
  if (!/^https:\/\/apps\.apple\.com\/.*\/?id\d+/.test(url) && !/itunes\.apple\.com/.test(url)) {
    throw new ValidationError(
      `META_OBJECT_STORE_URL does not look like an App Store URL: ${url}`,
      'It must be an iTunes/App Store URL with a numeric app id, e.g. https://apps.apple.com/app/id6743630735',
    );
  }

  const promoted: PromotedObject = {
    application_id: require_(config, 'appId'),
    object_store_url: url,
  };

  if (customEventType) {
    promoted.custom_event_type = customEventType;
    // A custom (non-standard) event rides in as OTHER + the event name.
    if (customEventType === 'OTHER') {
      if (!customEventStr) {
        throw new ValidationError(
          'custom_event_type OTHER requires the event name (custom_event_str).',
        );
      }
      promoted.custom_event_str = customEventStr;
    }
  }

  return promoted;
}
