import * as SMS from 'expo-sms';
import { Alert } from 'react-native';
import { generateOneLink } from '../services/appsflyer';

/**
 * Creates an SMS invite record, generates a deep link, and opens the SMS composer.
 * Shared across all invite flows (settings, addMatch, onboarding).
 */
export async function sendSMSInviteToContacts(
  contacts: { phone: string; name: string }[],
  invitePlayersBySMS: (contacts: { phone: string; name: string }[]) => Promise<{ inviteId: string }>,
): Promise<void> {
  const { inviteId } = await invitePlayersBySMS(contacts);
  const deepLink = await generateOneLink(inviteId);
  const message = `Hey! I'm using PickleGo to track our pickleball matches. Join me and let's play! ${deepLink}`;
  const phones = contacts.map(c => {
    const p = c.phone;
    // Ensure all numbers have + prefix for international SMS
    return p.startsWith('+') ? p : `+${p}`;
  });
  const canSend = await SMS.isAvailableAsync();
  if (canSend) {
    await SMS.sendSMSAsync(phones, message);
  } else {
    Alert.alert('SMS Not Available', 'SMS is not available on this device.');
  }
}
