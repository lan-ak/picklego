import { initializeApp } from 'firebase/app';
import {
  initializeAuth,
  // @ts-ignore - getReactNativePersistence exists at runtime but is missing from TS declarations
  getReactNativePersistence,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged as firebaseOnAuthStateChanged,
  sendPasswordResetEmail,
  signInWithCredential,
  GoogleAuthProvider,
  OAuthProvider,
} from 'firebase/auth';
import ReactNativeAsyncStorage from '@react-native-async-storage/async-storage';
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  addDoc,
  deleteDoc,
  collection,
  query,
  where,
  getDocs,
  orderBy,
  limit,
  arrayUnion,
  arrayRemove,
  writeBatch,
} from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getFunctions, httpsCallable } from 'firebase/functions';
import * as Crypto from 'expo-crypto';
import { Player, Match, MatchNotification, SMSInvite } from '../types';

// Firebase configuration from environment variables
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY ?? "",
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "",
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? "",
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET ?? "",
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "",
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID ?? "",
  measurementId: process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID ?? "",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(ReactNativeAsyncStorage)
});
export const db = getFirestore(app);
const storage = getStorage(app);
const functions = getFunctions(app);

// Strip undefined values from an object before passing to Firestore
export const stripUndefined = <T extends Record<string, any>>(obj: T): T => {
  return Object.fromEntries(
    Object.entries(obj).filter(([_, v]) => v !== undefined)
  ) as T;
};

// Firestore helper functions
import { normalizePhone, hashPhone } from '../utils/phone';

async function computePhoneHash(phone: string | undefined): Promise<string | undefined> {
  if (!phone) return undefined;
  const normalized = normalizePhone(phone);
  if (normalized.length < 10) return undefined;
  return hashPhone(normalized);
}

export const createPlayerDocument = async (player: Player) => {
  try {
    const { password, ...playerData } = player;
    const phoneHash = await computePhoneHash(playerData.phoneNumber);
    const dataToWrite = {
      ...playerData,
      ...(playerData.email ? { emailLowercase: playerData.email.trim().toLowerCase() } : {}),
      ...(phoneHash ? { phoneNumberHash: phoneHash } : {}),
    };
    await setDoc(doc(db, 'players', player.id), stripUndefined(dataToWrite));
  } catch (error: any) {
    throw new Error('Failed to create player document: ' + error.message);
  }
};

export const updatePlayerDocument = async (playerId: string, data: Partial<Player>) => {
  try {
    const updateData: Record<string, any> = {
      ...data,
      updatedAt: Date.now(),
    };
    if (data.email !== undefined) {
      updateData.emailLowercase = data.email.trim().toLowerCase();
    }
    if (data.phoneNumber !== undefined) {
      const phoneHash = await computePhoneHash(data.phoneNumber);
      if (phoneHash) updateData.phoneNumberHash = phoneHash;
    }
    await updateDoc(doc(db, 'players', playerId), stripUndefined(updateData));
  } catch (error: any) {
    throw new Error('Failed to update player document: ' + error.message);
  }
};

export const uploadProfilePicture = async (
  playerId: string,
  localUri: string
): Promise<string> => {
  try {
    const response = await fetch(localUri);
    const blob = await response.blob();
    const storageRef = ref(storage, `profilePics/${playerId}`);
    await uploadBytes(storageRef, blob);
    return await getDownloadURL(storageRef);
  } catch (error: any) {
    throw new Error('Failed to upload profile picture: ' + error.message);
  }
};

export const getPlayerDocument = async (playerId: string) => {
  try {
    const docSnap = await getDoc(doc(db, 'players', playerId));
    if (docSnap.exists()) {
      return docSnap.data() as Player;
    }
    return null;
  } catch (error: any) {
    throw new Error('Failed to get player document: ' + error.message);
  }
};

export const getPlayerByEmail = async (email: string) => {
  try {
    const normalizedEmail = email.trim().toLowerCase();
    // Run both queries in parallel to catch docs with either field format
    const q1 = query(collection(db, 'players'), where('emailLowercase', '==', normalizedEmail));
    const q2 = query(collection(db, 'players'), where('email', '==', email));
    const [snap1, snap2] = await Promise.all([getDocs(q1), getDocs(q2)]);

    // Merge and deduplicate by document ID
    const allDocs = new Map<string, Player>();
    snap1.docs.forEach(d => allDocs.set(d.id, d.data() as Player));
    snap2.docs.forEach(d => { if (!allDocs.has(d.id)) allDocs.set(d.id, d.data() as Player); });

    const players = Array.from(allDocs.values());
    if (players.length === 0) return null;

    // Prefer real (non-placeholder) players over pending ones
    return players.find(p => !p.pendingClaim) || players[0];
  } catch (error: any) {
    throw new Error('Failed to get player by email: ' + error.message);
  }
};

export const getPlayersByEmail = async (email: string): Promise<Player[]> => {
  try {
    const normalizedEmail = email.trim().toLowerCase();
    const q = query(collection(db, 'players'), where('emailLowercase', '==', normalizedEmail));
    const querySnapshot = await getDocs(q);
    if (!querySnapshot.empty) {
      return querySnapshot.docs.map(doc => doc.data() as Player);
    }
    // Fallback for pre-migration docs
    const fallbackQ = query(collection(db, 'players'), where('email', '==', email));
    const fallbackSnapshot = await getDocs(fallbackQ);
    return fallbackSnapshot.docs.map(doc => doc.data() as Player);
  } catch (error: any) {
    throw new Error('Failed to get players by email: ' + error.message);
  }
};

export const getPlaceholderByEmail = async (email: string): Promise<Player | null> => {
  try {
    const normalizedEmail = email.trim().toLowerCase();
    const q = query(
      collection(db, 'players'),
      where('emailLowercase', '==', normalizedEmail),
      where('pendingClaim', '==', true),
      limit(1)
    );
    const snapshot = await getDocs(q);
    if (!snapshot.empty) {
      return snapshot.docs[0].data() as Player;
    }
    // Fallback for pre-migration docs
    const fallbackQ = query(
      collection(db, 'players'),
      where('email', '==', email),
      where('pendingClaim', '==', true),
      limit(1)
    );
    const fallbackSnapshot = await getDocs(fallbackQ);
    return fallbackSnapshot.empty ? null : fallbackSnapshot.docs[0].data() as Player;
  } catch (error: any) {
    throw new Error('Failed to check for placeholder: ' + error.message);
  }
};

export const getPlaceholdersByInviter = async (inviterId: string): Promise<Player[]> => {
  try {
    const q = query(
      collection(db, 'players'),
      where('invitedBy', '==', inviterId),
      where('pendingClaim', '==', true)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Player));
  } catch (error: any) {
    console.error('Failed to get placeholders by inviter:', error.message);
    return [];
  }
};

// Authentication functions
export const signUpWithEmail = async (email: string, password: string) => {
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    return userCredential.user;
  } catch (error: any) {
    throw error;
  }
};

export const signInWithEmail = async (email: string, password: string) => {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    return userCredential.user;
  } catch (error: any) {
    throw error;
  }
};

export const signOut = async () => {
  try {
    await firebaseSignOut(auth);
  } catch (error: any) {
    throw new Error(error.message);
  }
};

export const getCurrentUser = () => {
  return auth.currentUser;
};

export const onAuthStateChanged = (callback: (user: any) => void) => {
  return firebaseOnAuthStateChanged(auth, callback);
};

// Match CRUD functions
export const createMatchDocument = async (match: Match) => {
  try {
    await setDoc(doc(db, 'matches', match.id), stripUndefined(match));
  } catch (error: any) {
    throw new Error('Failed to create match document: ' + error.message);
  }
};

export const updateMatchDocument = async (matchId: string, data: Partial<Match>) => {
  try {
    // Force token refresh to avoid stale auth errors
    if (auth.currentUser) {
      await auth.currentUser.getIdToken(true);
    }
    await updateDoc(doc(db, 'matches', matchId), stripUndefined(data));
  } catch (error: any) {
    throw new Error('Failed to update match document: ' + error.message);
  }
};

export const deleteMatchDocument = async (matchId: string) => {
  try {
    console.log(`[deleteMatch] Deleting match ${matchId}, auth uid: ${auth.currentUser?.uid}`);
    // Force token refresh to avoid stale auth errors
    if (auth.currentUser) {
      await auth.currentUser.getIdToken(true);
    }
    await deleteDoc(doc(db, 'matches', matchId));
  } catch (error: any) {
    throw new Error('Failed to delete match document: ' + error.message);
  }
};

export const softDeleteMatch = async (matchId: string, playerId: string) => {
  try {
    // Force token refresh to avoid stale auth errors
    if (auth.currentUser) {
      await auth.currentUser.getIdToken(true);
    }
    await updateDoc(doc(db, 'matches', matchId), {
      deletedByPlayerIds: arrayUnion(playerId),
    });
  } catch (error: any) {
    throw new Error('Failed to soft-delete match: ' + error.message);
  }
};

export const getMatchesForPlayer = async (playerId: string): Promise<Match[]> => {
  try {
    const q = query(
      collection(db, 'matches'),
      where('allPlayerIds', 'array-contains', playerId)
    );
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => doc.data() as Match);
  } catch (error: any) {
    throw new Error('Failed to get matches for player: ' + error.message);
  }
};

export const getMatchDocument = async (matchId: string): Promise<Match | null> => {
  try {
    const snap = await getDoc(doc(db, 'matches', matchId));
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() } as Match;
  } catch {
    return null;
  }
};

export const deletePlayerDocument = async (playerId: string) => {
  try {
    await deleteDoc(doc(db, 'players', playerId));
  } catch (error: any) {
    throw new Error('Failed to delete player document: ' + error.message);
  }
};

// Notification functions
export const createNotificationDocument = async (notification: MatchNotification) => {
  try {
    await setDoc(doc(db, 'notifications', notification.id), stripUndefined(notification as unknown as Record<string, any>));
  } catch (error: any) {
    throw new Error('Failed to create notification document: ' + error.message);
  }
};

export const batchCreateNotificationDocuments = async (notifications: MatchNotification[]) => {
  if (notifications.length === 0) return;
  try {
    const batch = writeBatch(db);
    for (const notification of notifications) {
      batch.set(doc(db, 'notifications', notification.id), stripUndefined(notification as unknown as Record<string, any>));
    }
    await batch.commit();
  } catch (error: any) {
    throw new Error('Failed to batch create notification documents: ' + error.message);
  }
};

export const updateNotificationDocument = async (notificationId: string, data: Partial<MatchNotification>) => {
  try {
    await updateDoc(doc(db, 'notifications', notificationId), stripUndefined(data as unknown as Record<string, any>));
  } catch (error: any) {
    throw new Error('Failed to update notification document: ' + error.message);
  }
};

export const deleteNotificationDocument = async (notificationId: string) => {
  try {
    await deleteDoc(doc(db, 'notifications', notificationId));
  } catch (error: any) {
    throw new Error('Failed to delete notification document: ' + error.message);
  }
};

export const getNotificationsForPlayer = async (playerId: string): Promise<MatchNotification[]> => {
  try {
    const q = query(
      collection(db, 'notifications'),
      where('recipientId', '==', playerId),
      orderBy('createdAt', 'desc'),
      limit(50)
    );
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => doc.data() as MatchNotification);
  } catch (error: any) {
    throw new Error('Failed to get notifications for player: ' + error.message);
  }
};

export const getNotificationsForMatchBySender = async (matchId: string, senderId: string): Promise<MatchNotification[]> => {
  try {
    const q = query(
      collection(db, 'notifications'),
      where('matchId', '==', matchId),
      where('senderId', '==', senderId),
      orderBy('createdAt', 'desc')
    );
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => doc.data() as MatchNotification);
  } catch (error: any) {
    throw new Error('Failed to get notifications for match: ' + error.message);
  }
};

// Password reset
export const sendPasswordReset = async (email: string) => {
  try {
    await sendPasswordResetEmail(auth, email);
  } catch (error: any) {
    throw new Error(error.message);
  }
};

// Social authentication

export const signInWithGoogle = async () => {
  try {
    const { GoogleSignin } = require('@react-native-google-signin/google-signin');
    GoogleSignin.configure({
      webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? "",
    });
    await GoogleSignin.hasPlayServices();
    const response = await GoogleSignin.signIn();
    const idToken = response.data?.idToken;
    if (!idToken) {
      throw new Error('No ID token returned from Google Sign-In');
    }
    const credential = GoogleAuthProvider.credential(idToken);
    const userCredential = await signInWithCredential(auth, credential);
    return userCredential.user;
  } catch (error: any) {
    if (error.code === 'SIGN_IN_CANCELLED') {
      throw { cancelled: true, message: 'Google Sign-In was cancelled' };
    }
    throw new Error('Google Sign-In failed: ' + error.message);
  }
};

export const signInWithApple = async () => {
  try {
    const AppleAuthentication = require('expo-apple-authentication');
    const Crypto = require('expo-crypto');

    const rawNonce = Math.random().toString(36).substring(2, 10) +
      Math.random().toString(36).substring(2, 10);
    const hashedNonce = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      rawNonce,
    );

    const appleCredential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashedNonce,
    });

    const { identityToken, fullName } = appleCredential;
    if (!identityToken) {
      throw new Error('No identity token returned from Apple Sign-In');
    }

    const provider = new OAuthProvider('apple.com');
    const oAuthCredential = provider.credential({
      idToken: identityToken,
      rawNonce: rawNonce,
    });

    const userCredential = await signInWithCredential(auth, oAuthCredential);

    // Apple only provides the name on the very first sign-in
    const displayName = fullName
      ? [fullName.givenName, fullName.familyName].filter(Boolean).join(' ')
      : null;

    return {
      user: userCredential.user,
      displayName,
    };
  } catch (error: any) {
    if (error.code === 'ERR_REQUEST_CANCELED') {
      throw { cancelled: true, message: 'Apple Sign-In was cancelled' };
    }
    throw new Error('Apple Sign-In failed: ' + error.message);
  }
};

// Push token management
export const addPushToken = async (playerId: string, token: string) => {
  try {
    await updateDoc(doc(db, 'players', playerId), {
      pushTokens: arrayUnion(token),
    });
  } catch (error: any) {
    throw new Error('Failed to add push token: ' + error.message);
  }
};

export const removePushToken = async (playerId: string, token: string) => {
  try {
    await updateDoc(doc(db, 'players', playerId), {
      pushTokens: arrayRemove(token),
    });
  } catch (error: any) {
    throw new Error('Failed to remove push token: ' + error.message);
  }
};

// Player connection management
export const addConnectionsBatch = async (playerIdA: string, playerIdB: string) => {
  try {
    const now = Date.now();
    const batch = writeBatch(db);
    batch.update(doc(db, 'players', playerIdA), { connections: arrayUnion(playerIdB), updatedAt: now });
    batch.update(doc(db, 'players', playerIdB), { connections: arrayUnion(playerIdA), updatedAt: now });
    await batch.commit();
  } catch (error: any) {
    throw new Error('Failed to add connection: ' + error.message);
  }
};

export const removeConnection = async (playerId: string, connectionId: string) => {
  try {
    await updateDoc(doc(db, 'players', playerId), {
      connections: arrayRemove(connectionId),
      updatedAt: Date.now(),
    });
  } catch (error: any) {
    throw new Error('Failed to remove connection: ' + error.message);
  }
};

export const addPendingConnection = async (playerId: string, recipientId: string) => {
  try {
    await updateDoc(doc(db, 'players', playerId), {
      pendingConnections: arrayUnion(recipientId),
      updatedAt: Date.now(),
    });
  } catch (error: any) {
    throw new Error('Failed to add pending connection: ' + error.message);
  }
};

// Cloud Function callables — centralised auth + token refresh
const authenticatedCallable = async <TData, TResult>(
  functionName: string,
  data: TData,
): Promise<TResult> => {
  if (!auth.currentUser) {
    throw new Error('Must be authenticated');
  }
  const originalUid = auth.currentUser.uid;
  await auth.currentUser.getIdToken(true);
  const fn = httpsCallable(functions, functionName);
  try {
    const result = await fn(data);
    return result.data as TResult;
  } catch (error: any) {
    // Verify the same user is still signed in before retrying
    if (error?.code === 'functions/unauthenticated' && auth.currentUser && auth.currentUser.uid === originalUid) {
      await auth.currentUser.getIdToken(true);
      const result = await fn(data);
      return result.data as TResult;
    }
    throw error;
  }
};

export const callAcceptPlayerInvite = (notificationId: string) =>
  authenticatedCallable<{ notificationId: string }, { accepted: boolean; senderId: string; acceptNotificationId: string }>(
    'acceptPlayerInvite', { notificationId },
  );

export const callClaimPlaceholderProfile = (name: string) =>
  authenticatedCallable<{ name: string }, { claimed: boolean; matchesUpdated: number }>(
    'claimPlaceholderProfile', { name },
  );

export const callCreateSMSInvite = (recipientPhones: string[], recipientNames: string[]) =>
  authenticatedCallable<
    { recipientPhones: string[]; recipientNames: string[] },
    { inviteId: string }
  >('createSMSInvite', { recipientPhones, recipientNames });

export const callClaimSMSInvite = (inviteId: string) =>
  authenticatedCallable<
    { inviteId: string },
    { claimed: boolean; senderId?: string; reason?: string }
  >('claimSMSInvite', { inviteId });

export const callLookupPhoneNumbers = (phoneHashes: string[]) =>
  authenticatedCallable<
    { phoneHashes: string[] },
    { matches: Record<string, { playerId: string; playerName: string }> }
  >('lookupPhoneNumbers', { phoneHashes });

export const callFindSMSInvitesByPhone = async (normalizedPhone: string): Promise<SMSInvite[]> => {
  const result = await authenticatedCallable<
    { phoneHashes: string[]; normalizedPhone: string },
    { matches: Record<string, any>; pendingInvites: SMSInvite[] }
  >('lookupPhoneNumbers', { phoneHashes: [], normalizedPhone });
  return result.pendingInvites || [];
};

export const callDeleteAccount = () =>
  authenticatedCallable<{}, { deleted: boolean; placeholdersRemoved: number }>(
    'deleteAccount', {},
  );

export const callResendMatchNotifications = (matchId: string) =>
  authenticatedCallable<{ matchId: string }, { sent: number }>(
    'resendMatchNotifications', { matchId },
  );

export const callJoinOpenMatch = (matchId: string) =>
  authenticatedCallable<{ matchId: string }, { joined: boolean; isFull: boolean; reason?: string; waitlisted?: boolean; waitlistPosition?: number }>(
    'joinOpenMatch', { matchId },
  );

export const callLeaveOpenMatch = (matchId: string) =>
  authenticatedCallable<{ matchId: string }, { left: boolean }>(
    'leaveOpenMatch', { matchId },
  );

export const callCancelOpenMatch = (matchId: string) =>
  authenticatedCallable<{ matchId: string }, { cancelled: boolean }>(
    'cancelOpenMatch', { matchId },
  );

