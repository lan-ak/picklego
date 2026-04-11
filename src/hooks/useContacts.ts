import { useState, useEffect, useCallback } from 'react';
import { AppState, Linking } from 'react-native';
import * as Contacts from 'expo-contacts';
import * as SMS from 'expo-sms';
import { useData } from '../context/DataContext';
import type { ContactInfo } from '../types';
import { normalizePhone, hashPhone } from '../utils/phone';

interface UseContactsOptions {
  /** Controls auto-load: when true (and permission already granted), contacts load automatically */
  enabled: boolean;
}

interface UseContactsReturn {
  contactsList: ContactInfo[];
  filteredContacts: ContactInfo[];
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  selectedContacts: Set<string>;
  loadingContacts: boolean;
  permissionDenied: boolean;
  canAskAgain: boolean;
  hasRequestedContacts: boolean;
  isLimitedAccess: boolean;
  smsAvailable: boolean;
  loadContacts: () => Promise<void>;
  toggleContact: (phone: string) => void;
  handleAllowContacts: () => void;
  handleExpandAccess: () => Promise<void>;
  resetSelection: () => void;
  resetAll: () => void;
}

export function useContacts({ enabled }: UseContactsOptions): UseContactsReturn {
  const { lookupContactsOnPickleGo } = useData();

  const [contactsList, setContactsList] = useState<ContactInfo[]>([]);
  const [filteredContacts, setFilteredContacts] = useState<ContactInfo[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedContacts, setSelectedContacts] = useState<Set<string>>(new Set());
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [canAskAgain, setCanAskAgain] = useState(true);
  const [hasRequestedContacts, setHasRequestedContacts] = useState(false);
  const [isLimitedAccess, setIsLimitedAccess] = useState(false);
  const [smsAvailable, setSmsAvailable] = useState(true);

  // Check SMS availability
  useEffect(() => {
    SMS.isAvailableAsync().then(setSmsAvailable);
  }, []);

  // Auto-load contacts when enabled and permission already granted
  useEffect(() => {
    if (!enabled) return;

    (async () => {
      const { status } = await Contacts.getPermissionsAsync();
      if (status === 'granted') {
        setHasRequestedContacts(true);
        loadContacts();
      }
    })();
  }, [enabled]);

  // Filter contacts on search
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredContacts(contactsList);
      return;
    }
    const q = searchQuery.toLowerCase();
    setFilteredContacts(
      contactsList.filter(
        c => c.name.toLowerCase().includes(q) || c.phone.includes(q),
      ),
    );
  }, [searchQuery, contactsList]);

  // Re-check contacts permission when returning from Settings
  useEffect(() => {
    if (!permissionDenied || canAskAgain) return;

    const subscription = AppState.addEventListener('change', async (nextState) => {
      if (nextState === 'active') {
        const { status } = await Contacts.getPermissionsAsync();
        if (status === 'granted') {
          setPermissionDenied(false);
          setCanAskAgain(true);
          loadContacts();
        }
      }
    });

    return () => subscription.remove();
  }, [permissionDenied, canAskAgain]);

  const loadContacts = useCallback(async () => {
    setLoadingContacts(true);
    try {
      const { status, canAskAgain: canAsk, accessPrivileges } = await Contacts.requestPermissionsAsync();
      if (status !== 'granted') {
        setPermissionDenied(true);
        setCanAskAgain(canAsk ?? true);
        setLoadingContacts(false);
        return;
      }

      setPermissionDenied(false);
      setIsLimitedAccess(accessPrivileges === 'limited');

      const { data } = await Contacts.getContactsAsync({
        fields: [
          Contacts.Fields.PhoneNumbers,
          Contacts.Fields.Name,
          Contacts.Fields.Image,
        ],
      });

      const contacts: ContactInfo[] = [];
      const seenPhones = new Set<string>();

      for (const contact of data) {
        if (!contact.phoneNumbers) continue;
        const name = contact.name || contact.firstName || contact.lastName || '';
        for (const pn of contact.phoneNumbers) {
          if (!pn.number) continue;
          // If number starts with +, it's already international — strip + and use digits directly
          const raw = pn.number.trim();
          const normalized = raw.startsWith('+')
            ? raw.replace(/\D/g, '')
            : normalizePhone(raw);
          if (normalized.length < 7 || seenPhones.has(normalized)) continue;
          seenPhones.add(normalized);
          contacts.push({
            name: name || pn.number,
            phone: normalized,
            contactId: contact.id,
            imageUri: contact.image?.uri,
          });
        }
      }

      contacts.sort((a, b) => a.name.localeCompare(b.name));

      // Look up which contacts are already on PickleGo
      if (contacts.length > 0) {
        try {
          const hashes = await Promise.all(
            contacts.map(c => hashPhone(c.phone)),
          );
          const hashToContact = new Map<string, number>();
          hashes.forEach((h, i) => hashToContact.set(h, i));

          const matches = await lookupContactsOnPickleGo(hashes);
          for (const [hash, info] of matches) {
            const idx = hashToContact.get(hash);
            if (idx !== undefined) {
              contacts[idx].isOnPickleGo = true;
              contacts[idx].pickleGoPlayerId = info.playerId;
              contacts[idx].pickleGoPlayerName = info.playerName;
            }
          }
        } catch (error) {
          console.error('Error looking up phone numbers:', error);
        }
      }

      // Sort: PickleGo users first, then alphabetical
      contacts.sort((a, b) => {
        if (a.isOnPickleGo && !b.isOnPickleGo) return -1;
        if (!a.isOnPickleGo && b.isOnPickleGo) return 1;
        return a.name.localeCompare(b.name);
      });

      setContactsList(contacts);
      setFilteredContacts(contacts);
    } catch (error) {
      console.error('Error loading contacts:', error);
    }
    setLoadingContacts(false);
  }, [lookupContactsOnPickleGo]);

  const toggleContact = useCallback((phone: string) => {
    setSelectedContacts(prev => {
      const next = new Set(prev);
      if (next.has(phone)) next.delete(phone);
      else next.add(phone);
      return next;
    });
  }, []);

  const handleAllowContacts = useCallback(() => {
    setHasRequestedContacts(true);
    loadContacts();
  }, [loadContacts]);

  const handleExpandAccess = useCallback(async () => {
    try {
      await Contacts.presentAccessPickerAsync?.();
      loadContacts();
    } catch {
      // User dismissed the picker
    }
  }, [loadContacts]);

  const resetSelection = useCallback(() => {
    setSelectedContacts(new Set());
  }, []);

  const resetAll = useCallback(() => {
    setSearchQuery('');
    setSelectedContacts(new Set());
    setHasRequestedContacts(false);
    setContactsList([]);
    setFilteredContacts([]);
  }, []);

  return {
    contactsList,
    filteredContacts,
    searchQuery,
    setSearchQuery,
    selectedContacts,
    loadingContacts,
    permissionDenied,
    canAskAgain,
    hasRequestedContacts,
    isLimitedAccess,
    smsAvailable,
    loadContacts,
    toggleContact,
    handleAllowContacts,
    handleExpandAccess,
    resetSelection,
    resetAll,
  };
}
